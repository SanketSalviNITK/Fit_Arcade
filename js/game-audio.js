/**
 * GameAudio — hub-side audio director for FIT-ARCADE.
 *
 * Every game gets its own procedurally-synthesized background theme plus
 * motion-reactive sound effects. Crucially, all audio plays from the HUB's
 * already-unlocked AudioContext (the user launched the game with a click),
 * so there is NO per-game code to touch and no iframe autoplay problem:
 *   - Movement SFX come from the motion events the hub already emits
 *     (jump / squat / punch / arms-overhead / push-up).
 *   - Collect blips come from the game's upward `score` messages.
 *   - The game-over sting comes from the game's `over` message.
 *   - The per-game theme is chosen by filename on launch.
 *
 * This mirrors the "minimal-touch" seam: games stay untouched; the hub
 * translates their existing signals into audio.
 */

// Distinct chiptune theme per game. root = lead register (Hz); lead/bass are
// semitone offsets from root; null = rest. wave: square|triangle|sawtooth.
const GAME_MUSIC = {
    'phaser-rooftop-demo.html':      { tempo: 150, root: 220.00, wave: 'square',   hat: true,  lead: [0, 3, 5, 7, 5, 3, 0, null, 0, 3, 5, 10, 7, 5, 3, null], bass: [0, null, 7, null] },
    'phaser-climber-demo.html':      { tempo: 128, root: 261.63, wave: 'triangle', hat: false, lead: [0, 2, 4, 7, 4, 7, 9, 12], bass: [0, 0, 5, 5] },
    'phaser-rope-demo.html':         { tempo: 138, root: 196.00, wave: 'square',   hat: true,  lead: [0, 3, 7, 3, 5, 3, 0, null], bass: [0, null, 3, null] },
    'phaser-brawler-demo.html':      { tempo: 146, root: 233.08, wave: 'square',   hat: true,  lead: [0, 0, 3, 0, 5, 3, 0, -2], bass: [0, 0, 0, 3] },
    'phaser-train-demo.html':        { tempo: 130, root: 174.61, wave: 'sawtooth', hat: true,  lead: [0, 5, 0, 5, 7, 5, 3, 0], bass: [0, 0, 0, 0] },
    'phaser-jetpack-demo.html':      { tempo: 122, root: 293.66, wave: 'triangle', hat: false, lead: [0, 4, 7, 11, 7, 4, 0, null], bass: [0, 0, 5, 5] },
    'three-hoverboard-demo-v2.html': { tempo: 156, root: 220.00, wave: 'sawtooth', hat: true,  lead: [0, 7, 10, 7, 5, 3, 0, 3], bass: [0, 0, -2, -2] }
};
const DEFAULT_MUSIC = GAME_MUSIC['phaser-rooftop-demo.html'];

// Motion event -> SFX name (see RetroAudio.playSfx).
const EVENT_SFX = {
    jump: 'jump',
    squat: 'duck',
    punchLeft: 'punch',
    punchRight: 'punch',
    armsOverhead: 'power',
    pushup: 'thud'
};

const GameAudio = {
    _wired: false,
    _active: false,
    _lastScore: 0,
    _lastCollect: 0,
    _lastEvt: {},

    /** Subscribe once to the motion bus. Safe to call anytime after motion-bus.js loads. */
    init() {
        if (this._wired || typeof motionBus === 'undefined') return;
        this._wired = true;

        // Movement SFX from the real motion events (only while a game is active).
        motionBus.on('*', (evt) => {
            if (!this._active) return;
            const name = EVENT_SFX[evt];
            if (!name) return;
            const now = (performance && performance.now) ? performance.now() : Date.now();
            if (now - (this._lastEvt[evt] || 0) < 90) return; // de-machine-gun
            this._lastEvt[evt] = now;
            audio.playSfx(name);
        });

        // Collect blip when the game's score climbs (throttled so distance-score
        // games don't buzz continuously).
        motionBus.on('game:score', (score) => {
            if (!this._active || typeof score !== 'number') return;
            if (score > this._lastScore) {
                const now = (performance && performance.now) ? performance.now() : Date.now();
                if (now - this._lastCollect > 220) { audio.playCollect(); this._lastCollect = now; }
            }
            this._lastScore = score;
        });

        // Game-over sting (music keeps playing so a retry isn't left silent).
        motionBus.on('game:over', () => {
            if (this._active) audio.playGameOver();
        });

        // The game only starts listening once loaded; (re)send the movement style
        // as soon as it reports ready so the control isn't lost to a race.
        motionBus.on('game:ready', () => {
            if (this._active) this.broadcastRhythm();
        });
    },

    /** Begin a game's theme + intro fanfare. Called from launchMVP(filename). */
    start(file) {
        this.init();
        audio.init();
        this._active = true;
        this._lastScore = 0;
        this._lastCollect = 0;
        const cfg = GAME_MUSIC[file] || DEFAULT_MUSIC;
        this._currentTempo = cfg.tempo;
        audio.playLevelStart();
        audio.startMusic(cfg);
        this.broadcastRhythm();
    },

    /** Push the current movement style to the active game (spawn cadence synced to music). */
    broadcastRhythm() {
        if (typeof motionBus === 'undefined') return;
        const mode = (typeof window !== 'undefined' && window.RHYTHM_MODE === 'rhythmic') ? 'rhythmic' : 'random';
        const tempo = this._currentTempo || 140;
        // Rhythmic obstacles arrive once per musical bar (4 beats).
        const beatMs = (mode === 'rhythmic') ? Math.round((60000 / tempo) * 4) : 0;
        motionBus.sendControl('rhythm', { mode, beatMs });
    },

    /** Stop all game audio. Called from quitMVP()/endCircuit(). */
    stop() {
        this._active = false;
        if (typeof audio !== 'undefined') audio.stopMusic();
    }
};

if (typeof window !== 'undefined') window.GameAudio = GameAudio;
GameAudio.init();
