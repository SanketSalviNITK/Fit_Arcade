/**
 * EffortEstimator — a real-time 0..1 exercise-intensity signal.
 *
 * Fuses two markerless sources the platform already produces:
 *   - Rep CADENCE: rep events from the MotionBus over a rolling window → reps/min.
 *   - Heart-rate RESERVE: (HR - restHR) / (maxHR - restHR) from the rPPG estimator,
 *     used only when the HR reading is confident (rPPG is unreliable under heavy motion).
 *
 * When HR is trustworthy the two are blended; otherwise effort falls back to cadence
 * alone. This drives the closed-loop adaptive-difficulty controller and the HUD.
 */
class EffortEstimator {
    constructor() {
        this.repTimes = [];
        this.windowSec = 20;
        this.repsForMax = 50;   // reps/min that counts as "all-out" cadence
        this.effort = 0;
        this.listeners = new Set();
        this._started = false;
        this._interval = null;
    }

    start() {
        if (this._started) return;
        this._started = true;
        if (typeof motionBus !== 'undefined') {
            motionBus.on('rep', () => this.repTimes.push(performance.now() / 1000));
        }
        this._interval = setInterval(() => this._tick(), 1000);
    }

    stop() {
        if (this._interval) clearInterval(this._interval);
        this._interval = null;
        this._started = false;
    }

    reset() { this.repTimes = []; this.effort = 0; }

    _tick() {
        const now = performance.now() / 1000;
        this.repTimes = this.repTimes.filter(t => t >= now - this.windowSec);
        const rpm = this.repTimes.length * (60 / this.windowSec);
        const cadence = Math.max(0, Math.min(1, rpm / this.repsForMax));

        let effort = cadence;
        if (typeof rppgEstimator !== 'undefined' && rppgEstimator.bpm > 0 && rppgEstimator.confidence >= 0.3) {
            const rest = rppgEstimator.restHR || 65;
            const max = rppgEstimator.maxHR || 190;
            const reserve = Math.max(0, Math.min(1, (rppgEstimator.bpm - rest) / (max - rest)));
            effort = 0.5 * cadence + 0.5 * reserve;
        }

        // Smooth to avoid twitchy difficulty changes.
        this.effort = this.effort * 0.6 + effort * 0.4;
        this._emit();
    }

    onUpdate(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
    _emit() { for (const cb of this.listeners) { try { cb(this.effort); } catch (e) {} } }
}

const effortEstimator = new EffortEstimator();
