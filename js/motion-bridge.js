/**
 * MotionBridge — the iframe side of the FIT-ARCADE motion seam.
 *
 * Loaded INSIDE each game's standalone HTML. It receives normalized pose from the hub
 * (see js/motion-bus.js) over postMessage and translates it into the exact keyboard
 * events the game already listens for — so a keyboard-only Phaser game becomes
 * motion-controlled WITHOUT changing its gameplay code ("minimal-touch bridge").
 *
 * Each game declares its own mapping via a global before this script loads:
 *
 *   window.MOTION_MAP = {
 *     jump:  { type: 'tap',  code: 'Space',     keyCode: 32 },              // fire on a discrete event
 *     squat: { type: 'hold', code: 'ArrowDown', keyCode: 40, state: 'isSquatting' }, // hold while posture true
 *   };
 *
 * It also:
 *   - exposes a `window.poseDetector` posture SHIM (for games that read posture directly,
 *     e.g. rooftop), kept in sync with the hub — so those reads keep working with no camera.
 *   - provides MotionBridge.reportScore(n) / reportGameOver(n) helpers so games can push
 *     their score/end back up to the hub HUD and summary.
 */
(function () {
    const MAP = window.MOTION_MAP || {};
    const TAP_HOLD_MS = 120; // keep a synthesized "tap" key down long enough for Phaser's JustDown

    // Hub-driven adaptive difficulty (1.0 = baseline). Games may read this to scale speed/spawn.
    if (typeof window.MOTION_DIFFICULTY !== 'number') window.MOTION_DIFFICULTY = 1;

    // Hub-driven movement style. In 'rhythmic' mode, games lock their obstacle spawn
    // interval to beatMs (synced to the game's music); 'random' = the game's own pacing.
    if (!window.MOTION_RHYTHM) window.MOTION_RHYTHM = { mode: 'random', beatMs: 0 };

    // ---- posture shim so games reading window.poseDetector.posture keep working ----
    if (typeof window.poseDetector === 'undefined') {
        window.poseDetector = {};
    }
    if (!window.poseDetector.posture) window.poseDetector.posture = {};
    if (!window.poseDetector.baselines) window.poseDetector.baselines = { calibrated: true };
    // Neutralize any self-camera calls the game might make: the hub owns the camera now.
    window.poseDetector.addListener = function () {};
    window.poseDetector.init = function () {};
    window.poseDetector.draw = function () {};
    window.poseDetector.calibrateStanding = function () { return true; };

    // ---- reliable synthetic keyboard events (keyCode is read-only, so we override it) ----
    function dispatchKey(type, def) {
        const e = new KeyboardEvent(type, {
            bubbles: true, cancelable: true,
            key: def.key || ' ', code: def.code
        });
        // Phaser 3.55 reads event.keyCode / event.which — force them.
        Object.defineProperty(e, 'keyCode', { get: () => def.keyCode });
        Object.defineProperty(e, 'which', { get: () => def.keyCode });
        window.dispatchEvent(e);
    }

    const heldDown = {}; // code -> bool, for hold mappings

    function tap(def) {
        dispatchKey('keydown', def);
        setTimeout(() => dispatchKey('keyup', def), TAP_HOLD_MS);
    }

    function setHeld(def, shouldHold) {
        if (shouldHold && !heldDown[def.code]) {
            heldDown[def.code] = true;
            dispatchKey('keydown', def);
        } else if (!shouldHold && heldDown[def.code]) {
            heldDown[def.code] = false;
            dispatchKey('keyup', def);
        }
    }

    // ---- message handling ----
    function onPose(posture, events) {
        // Keep the posture shim current for games that read it directly.
        Object.assign(window.poseDetector.posture, posture);

        // Discrete events → taps.
        for (const evt of events) {
            const def = MAP[evt];
            if (def && def.type === 'tap') tap(def);
        }
        // Hold states → held keys.
        for (const [evt, def] of Object.entries(MAP)) {
            if (def.type === 'hold' && def.state) {
                setHeld(def, !!posture[def.state]);
            }
        }
    }

    window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || d.source !== 'fitarcade') return;
        if (d.kind === 'pose') {
            onPose(d.posture || {}, d.events || []);
        } else if (d.kind === 'control') {
            if (d.action === 'difficulty' && typeof d.value === 'number') window.MOTION_DIFFICULTY = d.value;
            if (d.action === 'rhythm') {
                window.MOTION_RHYTHM = { mode: d.mode === 'rhythmic' ? 'rhythmic' : 'random', beatMs: +d.beatMs || 0 };
            }
            if (typeof window.onMotionControl === 'function') window.onMotionControl(d.action, d);
        }
    });

    // ---- upward reporting API for games ----
    function postUp(msg) {
        (window.parent || window).postMessage(Object.assign({ source: 'fitarcade-game' }, msg), '*');
    }

    window.MotionBridge = {
        reportReady: () => postUp({ kind: 'ready' }),
        reportScore: (score) => postUp({ kind: 'score', score }),
        reportGameOver: (score) => postUp({ kind: 'over', score }),
        // Manual triggers, handy for local testing inside a game.
        _tap: tap,
        _setHeld: setHeld
    };

    // Announce readiness so the hub knows the channel is live.
    window.addEventListener('load', () => window.MotionBridge.reportReady());
})();
