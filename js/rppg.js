/**
 * RppgEstimator — markerless heart-rate from the webcam (remote photoplethysmography).
 *
 * The hub already runs MediaPipe Pose on the webcam. This piggybacks on that feed:
 *   1. Derive a forehead ROI from the face landmarks (nose/eyes/ears).
 *   2. Each frame, average the skin RGB in that ROI.
 *   3. Over a rolling ~10s window, extract the pulse signal with a PLUGGABLE method
 *      (see _extractPulse): the shipped default is the green channel (Verkruysse
 *      et al. 2008); POS (Wang et al. 2017) and CHROM (de Haan & Jeanne 2013) are
 *      selectable as evaluation baselines. The default deliberately avoids the
 *      Philips-origin POS/CHROM projections for the deployed product; switch with
 *      setMethod() for the baseline comparison.
 *   4. Detrend + Hann-window + a band-limited periodogram (40–180 bpm) → heart rate.
 *   5. Gate on head MOTION: rPPG is unreliable while the body is moving hard, so the
 *      confidence is scaled down (and the reading held) during vigorous motion.
 *
 * Heart rate + a training zone (from % of max HR) drive the HUD, the effort estimator
 * (adaptive difficulty), and the shareable summary. maxHR can be personalized from age;
 * restHR feeds the heart-rate-reserve effort model. simulate() drives it without a camera.
 */
class RppgEstimator {
    constructor() {
        this.buffer = [];            // rolling samples: {t, r, g, b}
        this.windowSec = 10;
        this.minSamples = 60;

        // Pulse extractor (pluggable): 'green' | 'pos' | 'chrom'.
        // Default 'green' (Verkruysse 2008) keeps the shipped product off the
        // Philips-origin POS/CHROM methods; POS/CHROM stay available as baselines.
        this.method = 'green';

        this.bpm = 0;
        this.confidence = 0;
        this.zone = 'REST';
        this.maxHR = 190;            // 220 - age; personalized via setAge()
        this.restHR = 65;            // for heart-rate-reserve effort model

        // Motion gating.
        this.motionLevel = 0;        // smoothed nose speed (normalized units / s)
        this.motionThreshold = 0.12; // above this, confidence collapses
        this._prevNose = null;

        this.listeners = new Set();
        this._started = false;
        this._simulate = false;
        this._lastCompute = 0;

        this.roi = document.createElement('canvas');
        this.roi.width = 48; this.roi.height = 48;
        this.roiCtx = this.roi.getContext('2d', { willReadFrequently: true });

        this._boundListener = (results) => this._onFrame(results);
    }

    start() {
        if (this._started) return;
        this._started = true;
        if (typeof poseDetector !== 'undefined') poseDetector.addListener(this._boundListener);
    }

    setAge(age) {
        const a = parseInt(age, 10);
        if (a > 0 && a < 120) this.maxHR = 220 - a;
    }
    setRestHR(hr) {
        const v = parseInt(hr, 10);
        if (v > 30 && v < 120) this.restHR = v;
    }

    /** Choose the pulse-extraction method: 'green' (default) | 'pos' | 'chrom'. */
    setMethod(m) {
        if (m === 'green' || m === 'pos' || m === 'chrom') { this.method = m; this.reset(); }
    }

    onUpdate(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
    _emit() {
        const p = { bpm: this.bpm, confidence: this.confidence, zone: this.zone, motion: this.motionLevel };
        for (const cb of this.listeners) { try { cb(p); } catch (e) { console.error('rPPG listener error', e); } }
    }

    // ---- per-frame ROI sampling + motion tracking ----
    _onFrame(results) {
        if (this._simulate) return;
        const video = (typeof poseDetector !== 'undefined') ? poseDetector.video : null;
        const lm = results && results.poseLandmarks;
        if (!video || !lm || video.readyState < 2) return;

        this._trackMotion(lm);

        const roi = this._faceROI(lm, video.videoWidth || 640, video.videoHeight || 480);
        if (!roi) return;

        try {
            this.roiCtx.drawImage(video, roi.x, roi.y, roi.w, roi.h, 0, 0, this.roi.width, this.roi.height);
            const data = this.roiCtx.getImageData(0, 0, this.roi.width, this.roi.height).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
            const t = performance.now() / 1000;
            this.buffer.push({ t, r: r / n, g: g / n, b: b / n });

            const cutoff = t - this.windowSec;
            while (this.buffer.length && this.buffer[0].t < cutoff) this.buffer.shift();

            if (t - this._lastCompute > 1.0 && this.buffer.length >= this.minSamples) {
                this._lastCompute = t;
                this._compute();
            }
        } catch (e) { /* not ready — ignore this frame */ }
    }

    _trackMotion(lm) {
        const nose = lm[0];
        const t = performance.now() / 1000;
        if (nose && nose.visibility > 0.5) {
            if (this._prevNose) {
                const dt = Math.max(1e-3, t - this._prevNose.t);
                const dx = nose.x - this._prevNose.x, dy = nose.y - this._prevNose.y;
                const speed = Math.hypot(dx, dy) / dt;
                this.motionLevel = this.motionLevel * 0.7 + speed * 0.3; // smoothed
            }
            this._prevNose = { x: nose.x, y: nose.y, t };
        }
    }

    /** Forehead box from MediaPipe Pose face landmarks (0 nose, 2/5 eyes, 7/8 ears). */
    _faceROI(lm, W, H) {
        const nose = lm[0], le = lm[2], re = lm[5], lEar = lm[7], rEar = lm[8];
        if (!nose || nose.visibility < 0.5) return null;

        const eyeY = (le && re) ? (le.y + re.y) / 2 : nose.y;
        let faceW = (lEar && rEar) ? Math.abs(lEar.x - rEar.x)
                  : (le && re) ? Math.abs(le.x - re.x) * 2 : 0.1;
        faceW = Math.max(faceW, 0.06);

        const boxW = faceW * 0.55, boxH = faceW * 0.45;
        const cy = eyeY - faceW * 0.35;

        let x = (nose.x - boxW / 2) * W, y = (cy - boxH / 2) * H;
        let w = boxW * W, h = boxH * H;
        x = Math.max(0, Math.min(W - 2, x)); y = Math.max(0, Math.min(H - 2, y));
        w = Math.max(2, Math.min(W - x, w)); h = Math.max(2, Math.min(H - y, h));
        return { x, y, w, h };
    }

    // ---- pluggable pulse extractors (operate on mean-normalized channels) ----
    _std(a, N) {
        let m = 0; for (let i = 0; i < N; i++) m += a[i]; m /= N;
        let v = 0; for (let i = 0; i < N; i++) v += (a[i] - m) ** 2;
        return Math.sqrt(v / N);
    }

    /** Returns the raw pulse signal h[] (pre detrend/window) for the active method. */
    _extractPulse(Rn, Gn, Bn, N) {
        const h = new Array(N);

        if (this.method === 'green') {
            // Verkruysse et al. 2008 — green-channel plethysmography (shipped default).
            for (let i = 0; i < N; i++) h[i] = Gn[i];
            return h;
        }

        if (this.method === 'chrom') {
            // de Haan & Jeanne 2013 — chrominance (CHROM). [evaluation baseline]
            const X = new Array(N), Y = new Array(N);
            for (let i = 0; i < N; i++) {
                X[i] = 3 * Rn[i] - 2 * Gn[i];
                Y[i] = 1.5 * Rn[i] + Gn[i] - 1.5 * Bn[i];
            }
            const sY = this._std(Y, N);
            const a = sY > 1e-9 ? this._std(X, N) / sY : 0;
            for (let i = 0; i < N; i++) h[i] = X[i] - a * Y[i];
            return h;
        }

        // Wang et al. 2017 — Plane-Orthogonal-to-Skin (POS). [evaluation baseline]
        const S1 = new Array(N), S2 = new Array(N);
        for (let i = 0; i < N; i++) {
            S1[i] = Gn[i] - Bn[i];
            S2[i] = -2 * Rn[i] + Gn[i] + Bn[i];
        }
        const s2 = this._std(S2, N);
        const a = s2 > 1e-9 ? this._std(S1, N) / s2 : 0;
        for (let i = 0; i < N; i++) h[i] = S1[i] + a * S2[i];
        return h;
    }

    // ---- pulse extraction + periodogram ----
    _compute() {
        const buf = this.buffer;
        const N = buf.length;
        if (N < this.minSamples) return;
        const t0 = buf[0].t;

        // Temporal means per channel.
        let mR = 0, mG = 0, mB = 0;
        for (let i = 0; i < N; i++) { mR += buf[i].r; mG += buf[i].g; mB += buf[i].b; }
        mR /= N; mG /= N; mB /= N;
        if (mR < 1e-6 || mG < 1e-6 || mB < 1e-6) return;

        // Mean-normalized channels + relative timestamps.
        const Rn = new Array(N), Gn = new Array(N), Bn = new Array(N), ts = new Array(N);
        for (let i = 0; i < N; i++) {
            Rn[i] = buf[i].r / mR - 1;
            Gn[i] = buf[i].g / mG - 1;
            Bn[i] = buf[i].b / mB - 1;
            ts[i] = buf[i].t - t0;
        }

        // Extract the raw pulse via the selected (pluggable) method, then detrend + Hann.
        const h = this._extractPulse(Rn, Gn, Bn, N);
        let mh = 0;
        for (let i = 0; i < N; i++) mh += h[i];
        mh /= N;
        for (let i = 0; i < N; i++) {
            const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
            h[i] = (h[i] - mh) * win;
        }

        // Band-limited periodogram (handles non-uniform sampling via real timestamps).
        let bestP = -1, bestBpm = 0, totalP = 0, count = 0;
        for (let bpm = 40; bpm <= 180; bpm++) {
            const f = bpm / 60;
            let re = 0, im = 0;
            for (let i = 0; i < N; i++) {
                const ang = 2 * Math.PI * f * ts[i];
                re += h[i] * Math.cos(ang); im += h[i] * Math.sin(ang);
            }
            const p = re * re + im * im;
            totalP += p; count++;
            if (p > bestP) { bestP = p; bestBpm = bpm; }
        }

        const meanP = totalP / count;
        let conf = meanP > 0 ? Math.min(1, bestP / (meanP * 8)) : 0;
        // Motion gate: heavy body motion corrupts rPPG → collapse confidence.
        const motionPenalty = Math.max(0, 1 - this.motionLevel / this.motionThreshold);
        conf *= motionPenalty;
        this.confidence = conf;

        // Only move the estimate when we trust it; otherwise hold the last reading.
        if (conf >= 0.25) {
            this.bpm = this.bpm === 0 ? bestBpm : Math.round(this.bpm * 0.7 + bestBpm * 0.3);
            this.zone = this.zoneFor(this.bpm);
        }
        this._emit();
    }

    zoneFor(bpm) {
        const pct = bpm / this.maxHR;
        if (pct < 0.5) return 'REST';
        if (pct < 0.6) return 'WARM';
        if (pct < 0.7) return 'FAT BURN';
        if (pct < 0.85) return 'CARDIO';
        return 'PEAK';
    }

    reset() { this.buffer = []; this.bpm = 0; this.confidence = 0; this.zone = 'REST'; this.motionLevel = 0; this._prevNose = null; }

    // ---- DEV: drive HR without a camera to validate the pipeline ----
    simulate(bpm) {
        this._simulate = true;
        this.bpm = Math.round(bpm);
        this.confidence = 1;
        this.zone = this.zoneFor(this.bpm);
        this._emit();
    }
    stopSimulate() { this._simulate = false; }
}

const rppgEstimator = new RppgEstimator();
