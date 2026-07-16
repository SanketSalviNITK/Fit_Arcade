/**
 * Store — FIT-ARCADE's localStorage persistence layer.
 *
 * Survives across sessions:
 *   - calibration baselines (so users calibrate once, not every visit)
 *   - workout history (last 50 completed sessions)
 *   - progression (XP, level, daily streak, lifetime totals)
 *   - the biometric profile is handled inline in index.html (fitarcade.profile)
 */
const Store = {
    KEYS: {
        calib:    'fitarcade.calibration',
        history:  'fitarcade.history',
        progress: 'fitarcade.progress'
    },

    _get(key, def) {
        try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? def : v; }
        catch (e) { return def; }
    },
    _set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} },

    // ---- calibration ----
    loadCalibration() { return this._get(this.KEYS.calib, null); },
    saveCalibration(baselines) { this._set(this.KEYS.calib, baselines); },

    // ---- workout history ----
    getHistory() { return this._get(this.KEYS.history, []); },
    addWorkout(rec) {
        const h = this.getHistory();
        h.unshift(rec);
        if (h.length > 50) h.length = 50;
        this._set(this.KEYS.history, h);
        return h;
    },

    // ---- progression ----
    getProgress() {
        return this._get(this.KEYS.progress, {
            xp: 0, level: 1, streak: 0, lastWorkoutDate: null,
            totalWorkouts: 0, totalReps: 0, totalCalories: 0
        });
    },
    saveProgress(p) { this._set(this.KEYS.progress, p); }
};

// XP thresholds grow each level: advancing FROM level L costs L * 500 XP.
function levelInfo(xp) {
    let level = 1, acc = 0, need = 500;
    while (xp >= acc + need) { acc += need; level++; need = level * 500; }
    return { level, into: xp - acc, need, pct: Math.max(0, Math.min(1, (xp - acc) / need)) };
}
