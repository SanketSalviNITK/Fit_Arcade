/**
 * MotionBus — the hub-side "nervous system" of FIT-ARCADE.
 *
 * It owns nothing about the camera itself (that stays in PoseDetector). Instead it
 * subscribes to PoseDetector's per-frame posture, turns the raw boolean posture into:
 *   1. Normalized, debounced DISCRETE events (jump, squat, punchLeft, ...)   — edge triggered
 *   2. Continuous HOLD states (isSquatting, isLeaningLeft, ...)               — passed through
 *   3. A running REP count (decoupled fitness tracking, independent of any game's score)
 *
 * ...and broadcasts all of it to whichever game <iframe> is currently active, using
 * postMessage. Games never touch the camera; they just receive pose and report score back.
 *
 * This is the single seam that lets the polished (keyboard-only) Phaser games become
 * motion-controlled without rewriting their logic — see js/motion-bridge.js for the
 * iframe side that consumes these messages.
 */
class MotionBus {
    constructor() {
        this.subscribers = new Map();     // eventName -> Set<callback>
        this.targetFrame = null;          // the game iframe we stream pose into
        this.started = false;

        // Reps performed this session (rising-edge counts of "rep-like" motions).
        this.reps = 0;

        // Which discrete motions count as a "rep" for fitness tracking.
        this.repEvents = new Set([
            'jump', 'squat', 'punchLeft', 'punchRight', 'armsOverhead', 'pushup',
            'leanLeft', 'leanRight', 'crossPunchLeft', 'crossPunchRight',
            'highKneeLeft', 'highKneeRight', 'kickLeft', 'kickRight',
            'guard', 'wideStance', 'curlingLeft', 'curlingRight',
            'uppercutLeft', 'uppercutRight'
        ]);

        // Rising-edge event definitions: eventName -> posture boolean field.
        this.edgeMap = {
            jump: 'isJumping',
            squat: 'isSquatting',
            punchLeft: 'isPunchingLeft',
            punchRight: 'isPunchingRight',
            armsOverhead: 'isArmsOverhead',
            pushup: 'isPushingFront',
            leanLeft: 'isLeaningLeft',
            leanRight: 'isLeaningRight',
            crossPunchLeft: 'isCrossPunchingLeft',
            crossPunchRight: 'isCrossPunchingRight',
            highKneeLeft: 'isHighKneeLeft',
            highKneeRight: 'isHighKneeRight',
            kickLeft: 'isKickingLeft',
            kickRight: 'isKickingRight',
            guard: 'isGuarding',
            wideStance: 'isWideStance',
            curlingLeft: 'isCurlingLeft',
            curlingRight: 'isCurlingRight',
            uppercutLeft: 'isUppercutLeft',
            uppercutRight: 'isUppercutRight'
        };

        // Continuous/hold posture fields forwarded verbatim to the game each frame.
        this.holdFields = [
            'isSquatting', 'isJumping',
            'isLeaningLeft', 'isLeaningRight',
            'leftArmSide', 'rightArmSide',
            'isPushingFront', 'isArmsOverhead',
            'isPunchingLeft', 'isPunchingRight',
            'isCrossPunchingLeft', 'isCrossPunchingRight',
            'isHighKneeLeft', 'isHighKneeRight',
            'isKickingLeft', 'isKickingRight',
            'isGuarding', 'isWideStance',
            'isCurlingLeft', 'isCurlingRight',
            'isUppercutLeft', 'isUppercutRight'
        ];

        this._prev = {};                  // previous-frame posture booleans (for edge detection)
        this._boundListener = (results, posture) => this._onPose(results, posture);
        this._boundMessage = (e) => this._onGameMessage(e);
    }

    /** Begin subscribing to the shared PoseDetector and listening for game messages. */
    start() {
        if (this.started) return;
        this.started = true;
        if (typeof poseDetector !== 'undefined') {
            poseDetector.addListener(this._boundListener);
        }
        window.addEventListener('message', this._boundMessage);
    }

    // ---- pub/sub for the hub itself (HUD, circuit manager, etc.) ----
    on(eventName, cb) {
        if (!this.subscribers.has(eventName)) this.subscribers.set(eventName, new Set());
        this.subscribers.get(eventName).add(cb);
        return () => this.subscribers.get(eventName)?.delete(cb);
    }

    _emit(eventName, payload) {
        const set = this.subscribers.get(eventName);
        if (set) for (const cb of set) { try { cb(payload); } catch (e) { console.error('MotionBus subscriber error', e); } }
        const all = this.subscribers.get('*');
        if (all) for (const cb of all) { try { cb(eventName, payload); } catch (e) {} }
    }

    // ---- game iframe wiring ----

    /** Point the bus at the active game iframe and reset per-session counters. */
    attachFrame(iframeEl) {
        this.targetFrame = iframeEl;
        this.reps = 0;
        this._prev = {};
        this.gameScore = 0;
        this._emit('reps', this.reps);
    }

    detachFrame() {
        this.targetFrame = null;
    }

    _postToGame(msg) {
        const win = this.targetFrame && this.targetFrame.contentWindow;
        if (win) win.postMessage(Object.assign({ source: 'fitarcade' }, msg), '*');
    }

    // ---- core per-frame processing ----

    _onPose(results, posture) {
        if (!posture) return;

        // 1. Detect rising edges → discrete events.
        const events = [];
        for (const [evt, field] of Object.entries(this.edgeMap)) {
            const now = !!posture[field];
            const was = !!this._prev[field];
            if (now && !was) {
                events.push(evt);
                this._emit(evt, posture);
                if (this.repEvents.has(evt)) {
                    this.reps++;
                    this._emit('rep', { event: evt, reps: this.reps });
                    this._emit('reps', this.reps);
                }
            }
            this._prev[field] = now;
        }

        // 2. Build a slim hold-state snapshot for the game.
        const snapshot = {};
        for (const f of this.holdFields) snapshot[f] = !!posture[f];
        snapshot.hipY = posture.hipY;
        snapshot.headY = posture.headY;

        // 3. Stream pose down to the active game.
        this._postToGame({ kind: 'pose', posture: snapshot, events });
    }

    _onGameMessage(e) {
        const d = e.data;
        if (!d || d.source !== 'fitarcade-game') return;
        switch (d.kind) {
            case 'ready':
                this._emit('game:ready', d);
                break;
            case 'score':
                this.gameScore = d.score || 0;
                this._emit('game:score', this.gameScore);
                break;
            case 'over':
                this.gameScore = d.score ?? this.gameScore;
                this._emit('game:over', { score: this.gameScore });
                break;
        }
    }

    // ---- control channel (hub → game) ----
    sendControl(action, extra = {}) {
        this._postToGame(Object.assign({ kind: 'control', action }, extra));
    }

    /**
     * DEV: simulate a motion without a camera, so the pose→key→game path can be
     * verified in a preview/CI environment. Fires the event to hub subscribers AND
     * streams it to the active game exactly like a real detection.
     */
    debugFire(eventName, holdMs = 0) {
        this._emit(eventName, {});
        if (this.repEvents.has(eventName)) {
            this.reps++;
            this._emit('reps', this.reps);
        }
        const posture = {};
        const field = this.edgeMap[eventName];
        if (field) posture[field] = true;
        this._postToGame({ kind: 'pose', posture, events: [eventName] });
        if (holdMs > 0 && field) {
            setTimeout(() => this._postToGame({ kind: 'pose', posture: { [field]: false }, events: [] }), holdMs);
        }
    }
}

// Global hub-side instance.
const motionBus = new MotionBus();
