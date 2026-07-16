/**
 * DataLogger — research data-logging layer for FIT-ARCADE (OFF by default).
 *
 * Captures time-synchronized POSE + PHYSIOLOGY ground-truth labels while a game is
 * played, so they can be paired AFTER THE FACT (by timestamp) with an EXTERNAL
 * WiFi/CSI capture device to build a WiFi-sensing dataset. FIT-ARCADE only ever
 * produces the ground-truth labels here — the WiFi/CSI node is separate hardware
 * that logs its own stream; pairing happens offline using t_wall (or mark()/the
 * white-flash sync pulse if the two devices aren't NTP-synced). See
 * docs/research-logging.md for the full schema + pairing protocol.
 *
 * Zero cost when disabled: start()/stop()/mark()/setCollector() are the only entry
 * points that touch anything, and every internal hook is subscribed ONLY between a
 * start() and a stop() (never at load time). All source globals (poseDetector,
 * motionBus, rppgEstimator, effortEstimator) are typeof-guarded — a build missing
 * any one of them just logs less, it never throws.
 *
 * Output:
 *   - an in-memory ring buffer -> download() saves it as a timestamped .jsonl file.
 *   - an OPTIONAL live stream: setCollector(url) POSTs newline-delimited JSON
 *     batches to `${url}/log` as text/plain (a CORS "simple request" — no custom
 *     headers, so no preflight) every ~1s or ~200 records, off a timer, never the
 *     render loop. See tools/collector.mjs for the matching zero-dependency server.
 */
const DataLogger = {
    recording: false,
    meta: null,
    buffer: [],          // everything logged this session (bounded ring buffer)
    maxBuffer: 20000,    // ~10min at 30fps+events; hard cap so a forgotten session can't leak memory
    collectorUrl: null,

    // Cached latest values from the physiology/effort streams (pose frames embed these).
    _hr: 0,
    _hrConf: 0,
    _effort: 0,
    _reps: 0,

    _unsub: [],          // unsubscribe fns for the active session's source hooks
    _poseCb: null,
    _pending: [],        // records waiting for the next network flush
    _flushTimer: null,
    _flushEl: null,      // the white sync-flash overlay div (created lazily)
    _flushTimeout: null,

    // Motion-bus events that are session bookkeeping, not discrete motions —
    // excluded from the per-event log (reps are folded into every record instead).
    _metaEvents: { rep: 1, reps: 1, 'game:score': 1, 'game:over': 1, 'game:ready': 1 },

    /** Begin a session. meta = {subject?, game?, notes?, room?}. No-op if already recording. */
    start(meta) {
        if (this.recording) return;
        this.recording = true;
        this.meta = Object.assign({ subject: null, game: null, notes: null, room: null }, meta || {});
        this.buffer = [];
        this._pending = [];
        this._hr = 0; this._hrConf = 0; this._effort = 0; this._reps = 0;
        this._unsub = [];

        // Subscribe to sources ONLY while recording; every hook is undone in stop().
        if (typeof poseDetector !== 'undefined') {
            this._poseCb = (results, posture) => this._onPose(results, posture);
            poseDetector.addListener(this._poseCb);
            this._unsub.push(() => poseDetector.removeListener(this._poseCb));
        }
        if (typeof motionBus !== 'undefined') {
            this._unsub.push(motionBus.on('*', (evt) => this._onMotionEvent(evt)));
            this._unsub.push(motionBus.on('reps', (n) => { this._reps = n; }));
        }
        if (typeof rppgEstimator !== 'undefined') {
            this._unsub.push(rppgEstimator.onUpdate((p) => { this._hr = p.bpm; this._hrConf = p.confidence; }));
        }
        if (typeof effortEstimator !== 'undefined') {
            this._unsub.push(effortEstimator.onUpdate((e) => { this._effort = e; }));
        }

        this._flushTimer = setInterval(() => this._flush(), 1000);
        this._log('sync', { label: 'session-start', meta: this.meta });
    },

    /** End the session, detach every source hook, and flush any pending network batch. No-op if not recording. */
    stop() {
        if (!this.recording) return;
        this._log('sync', { label: 'session-end' });
        this.recording = false;
        this._unsub.forEach((fn) => { try { fn(); } catch (e) {} });
        this._unsub = [];
        if (this._flushTimer) clearInterval(this._flushTimer);
        this._flushTimer = null;
        this._flush(); // send whatever was left in the pending network batch
    },

    /** Write a sync-anchor record and flash the screen white (~120ms) so an observing camera can align streams. */
    mark(label) {
        this._flash();
        if (this.recording) this._log('sync', { label: label || 'mark' });
    },

    /** Point the live-stream at a collector server, e.g. DataLogger.setCollector('http://192.168.1.50:8787'). Pass '' / null to disable. */
    setCollector(url) {
        this.collectorUrl = (url && String(url).trim()) ? String(url).trim().replace(/\/+$/, '') : null;
    },

    /** Save the in-memory buffer as a timestamped .jsonl file. */
    download() {
        if (typeof document === 'undefined') return;
        const blob = new Blob([this.toJSONL()], { type: 'application/x-ndjson' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fitarcade-session-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    },

    /** The buffer as one-JSON-object-per-line text (handy for tests / manual inspection too). */
    toJSONL() {
        return this.buffer.map((r) => JSON.stringify(r)).join('\n') + (this.buffer.length ? '\n' : '');
    },

    // ---- per-frame pose capture (~camera framerate) ----
    _onPose(results, posture) {
        if (!this.recording) return;
        const lm = results && results.poseLandmarks;
        if (!lm) return; // nobody visible this frame — nothing meaningful to log

        const round4 = (v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : 0);
        const points = [];
        for (let i = 0; i < Math.min(33, lm.length); i++) {
            const p = lm[i];
            points.push([round4(p.x), round4(p.y), round4(p.z), round4(p.visibility)]);
        }

        // Only the posture flags that are currently true (keeps the record compact).
        const flags = {};
        if (posture) for (const k in posture) { if (posture[k] === true) flags[k] = true; }

        this._log('pose', {
            game: this.meta && this.meta.game,
            lm: points,
            posture: flags,
            hr: this._hr,
            hrConf: round4(this._hrConf),
            effort: round4(this._effort),
            reps: this._reps
        });
    },

    // ---- discrete motion events (jump/squat/punchLeft/...) ----
    _onMotionEvent(evt) {
        if (!this.recording || this._metaEvents[evt]) return;
        this._log('event', { name: evt, reps: this._reps });
    },

    // ---- shared record stamping + buffering ----
    _log(type, fields) {
        if (!this.recording) return;
        const rec = Object.assign({ t_mono: performance.now(), t_wall: Date.now(), type }, fields);
        this.buffer.push(rec);
        if (this.buffer.length > this.maxBuffer) this.buffer.shift(); // bounded, never blocks

        if (this.collectorUrl) {
            this._pending.push(rec);
            if (this._pending.length >= 200) this._flush();
        }
    },

    // ---- optional live network stream (batched; never blocks the render loop) ----
    _flush() {
        if (!this._pending.length || !this.collectorUrl || typeof fetch === 'undefined') { this._pending = []; return; }
        const batch = this._pending;
        this._pending = [];
        const body = batch.map((r) => JSON.stringify(r)).join('\n') + '\n';
        // text/plain + no custom headers keeps this a CORS "simple request" (no preflight round-trip).
        fetch(this.collectorUrl + '/log', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body,
            keepalive: true
        }).catch(() => {}); // best-effort — a dropped batch never breaks gameplay
    },

    // ---- the sync flash: a full-screen white overlay a camera can key off of ----
    _flash() {
        if (typeof document === 'undefined') return;
        if (!this._flashEl) {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:999999;' +
                'pointer-events:none;opacity:0;transition:opacity 40ms linear;';
            document.body.appendChild(el);
            this._flashEl = el;
        }
        this._flashEl.style.opacity = '1';
        clearTimeout(this._flashTimeout);
        this._flashTimeout = setTimeout(() => { this._flashEl.style.opacity = '0'; }, 120);
    }
};

if (typeof window !== 'undefined') window.DataLogger = DataLogger;
