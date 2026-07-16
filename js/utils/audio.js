class RetroAudio {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.masterVolume = 1.0;
        this.sfxVolume = 1.0;
    }

    setMasterVolume(val) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        this._applyMusicGain();
    }

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
    }

    getVolumeMultiplier() {
        return this.muted ? 0 : (this.masterVolume * this.sfxVolume);
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    setMuted(muted) {
        this.muted = muted;
        this._applyMusicGain();
    }

    playClick() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.setValueAtTime(300, this.ctx.currentTime + 0.05);

        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        gain.gain.setValueAtTime(0.05 * vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playJump() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15);

        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        gain.gain.setValueAtTime(0.1 * vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.25);
    }

    playDuck() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.2);

        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        gain.gain.setValueAtTime(0.1 * vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playHit() {
        if (this.muted) return;
        this.init();
        
        // Procedural explosion noise using buffer
        const bufferSize = this.ctx.sampleRate * 0.4; // 0.4 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill buffer with white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        // Custom lowpass filter to make it sound muffled/heavy
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.35);

        const gain = this.ctx.createGain();
        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        gain.gain.setValueAtTime(0.15 * vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noiseNode.start();
        noiseNode.stop(this.ctx.currentTime + 0.4);
    }

    playScore() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, this.ctx.currentTime + 0.16); // G5

        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        gain.gain.setValueAtTime(0.08 * vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playSuccess() {
        if (this.muted) return;
        this.init();
        
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // Arpeggio
        
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            const vol = this.getVolumeMultiplier();
            if (vol === 0) return;
            gain.gain.setValueAtTime(0.06 * vol, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.2);
        });
    }

    // ---- Additional gameplay SFX ----------------------------------------

    /** Punch/impact: filtered noise crack + low thump. */
    playPunch() {
        if (this.muted) return;
        this.init();
        const t = this.ctx.currentTime;
        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;

        const dur = 0.12;
        const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const noise = this.ctx.createBufferSource(); noise.buffer = buf;
        const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.25 * vol, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
        noise.connect(bp); bp.connect(ng); ng.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + dur);

        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(170, t);
        o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
        g.gain.setValueAtTime(0.18 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + 0.12);
    }

    /** Power-up chime (arms overhead): bright ascending square arpeggio. */
    playPowerUp() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        [392, 523.25, 659.25, 880].forEach((f, i) => {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(f, now + i * 0.05);
            g.gain.setValueAtTime(0.06 * vol, now + i * 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.13);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(now + i * 0.05); o.stop(now + i * 0.05 + 0.13);
        });
    }

    /** Body thud (push-up): heavy low sine drop. */
    playThud() {
        if (this.muted) return;
        this.init();
        const t = this.ctx.currentTime;
        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        g.gain.setValueAtTime(0.22 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + 0.22);
    }

    /** Pickup/collect: quick two-step coin blip. */
    playCollect() {
        if (this.muted) return;
        this.init();
        const t = this.ctx.currentTime;
        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(880, t);
        o.frequency.setValueAtTime(1318.51, t + 0.045);
        g.gain.setValueAtTime(0.05 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + 0.14);
    }

    /** Game-over sting: descending minor triangle run. */
    playGameOver() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        [523.25, 392, 329.63, 261.63].forEach((f, i) => {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(f, now + i * 0.14);
            g.gain.setValueAtTime(0.12 * vol, now + i * 0.14);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.3);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(now + i * 0.14); o.stop(now + i * 0.14 + 0.3);
        });
    }

    /** Short "here we go" fanfare when a game starts. */
    playLevelStart() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const vol = this.getVolumeMultiplier();
        if (vol === 0) return;
        [523.25, 659.25, 783.99].forEach((f, i) => {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(f, now + i * 0.07);
            g.gain.setValueAtTime(0.07 * vol, now + i * 0.07);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.18);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.18);
        });
    }

    /** Generic dispatcher so callers can trigger SFX by name. */
    playSfx(name) {
        switch (name) {
            case 'jump': return this.playJump();
            case 'duck': case 'squat': return this.playDuck();
            case 'punch': return this.playPunch();
            case 'power': return this.playPowerUp();
            case 'thud': return this.playThud();
            case 'collect': return this.playCollect();
            case 'hit': return this.playHit();
            case 'gameover': return this.playGameOver();
            case 'start': return this.playLevelStart();
            case 'score': return this.playScore();
        }
    }

    // ---- Procedural background music -------------------------------------
    // A tiny lookahead step-sequencer. Each game passes a distinct config
    // { tempo, root, wave, hat, lead[], bass[] } so every game has its own
    // theme, all synthesized (no audio files).

    _musicTargetGain() {
        return (this.muted ? 0 : 1) * this.masterVolume * 0.16;
    }

    _applyMusicGain() {
        if (this.musicGain && this.ctx) {
            this.musicGain.gain.setValueAtTime(this._musicTargetGain(), this.ctx.currentTime);
        }
    }

    _noteFreq(root, semi) {
        return root * Math.pow(2, semi / 12);
    }

    startMusic(cfg) {
        this.init();
        this.stopMusic();
        if (!cfg) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this._musicTargetGain();
        this.musicGain.connect(this.ctx.destination);

        this._music = { cfg, step: 0, nextTime: this.ctx.currentTime + 0.08, on: true, timer: null };
        this._musicLoop();
    }

    stopMusic() {
        if (this._music) {
            this._music.on = false;
            if (this._music.timer) clearTimeout(this._music.timer);
            this._music = null;
        }
        if (this.musicGain) {
            try { this.musicGain.disconnect(); } catch (e) {}
            this.musicGain = null;
        }
    }

    _musicLoop() {
        const m = this._music;
        if (!m || !m.on) return;
        const cfg = m.cfg;
        const stepDur = (60 / cfg.tempo) / 2; // eighth-note grid
        const len = cfg.lead.length;
        while (m.nextTime < this.ctx.currentTime + 0.16) {
            if (!this.muted) this._scheduleMusicStep(cfg, m.step, m.nextTime, stepDur);
            m.nextTime += stepDur;
            m.step = (m.step + 1) % len;
        }
        m.timer = setTimeout(() => this._musicLoop(), 45);
    }

    _scheduleMusicStep(cfg, step, t, stepDur) {
        const G = this.musicGain;
        if (!G) return;

        // Lead voice
        const lead = cfg.lead[step % cfg.lead.length];
        if (lead != null) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = cfg.wave || 'square';
            o.frequency.value = this._noteFreq(cfg.root, lead);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 0.9);
            o.connect(g); g.connect(G);
            o.start(t); o.stop(t + stepDur);
        }

        // Bass voice (one octave down)
        const bass = cfg.bass[step % cfg.bass.length];
        if (bass != null) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'triangle';
            o.frequency.value = this._noteFreq(cfg.root / 2, bass);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 1.7);
            o.connect(g); g.connect(G);
            o.start(t); o.stop(t + stepDur * 1.9);
        }

        // Hi-hat on offbeats
        if (cfg.hat && (step % 2 === 1)) {
            const dur = 0.03;
            const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
            const n = this.ctx.createBufferSource(); n.buffer = buf;
            const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
            const g = this.ctx.createGain(); g.gain.value = 0.22;
            n.connect(hp); hp.connect(g); g.connect(G);
            n.start(t); n.stop(t + dur);
        }
    }

    playVoice(text) {
        if (this.muted) return;
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.05;
            utterance.pitch = 1.1;
            utterance.volume = this.masterVolume;
            window.speechSynthesis.speak(utterance);
        }
    }
}

// Global instance
const audio = new RetroAudio();
