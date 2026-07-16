class GameEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        
        this.state = 'START'; // START, PLAYING, PAUSED, GAMEOVER
        this.score = 0;
        this.combo = 1;
        this.streak = 0;
        this.reps = 0;
        this.timer = 60; // 60 seconds default game
        this.timerInterval = null;

        this.workoutConfig = { mode: 'TIME', targetSets: 1, targetReps: 0, restTime: 0 };
        this.currentSet = 1;

        this.animationFrameId = null;
        this.lastTime = 0;

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        // We lock the internal rendering resolution to 16:9 pixel aspect ratio
        this.canvas.width = 960;
        this.canvas.height = 540;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    start(workoutConfig = null) {
        audio.init();
        if (workoutConfig) {
            this.workoutConfig = workoutConfig;
        }

        this.score = 0;
        this.combo = 1;
        this.streak = 0;
        this.reps = 0;
        this.totalReps = 0;
        this.currentSet = 1;
        this.timer = this.workoutConfig.mode === 'TIME' ? 60 : 0;
        this.state = 'COUNTDOWN';
        this.countdownVal = 3.0; // 3 seconds count
        this.lastCountDigit = 3;
        this.restCountdown = 0;
        this.lastTime = performance.now();

        if (this.timerInterval) clearInterval(this.timerInterval);

        this.initGame();
        this.loop(this.lastTime);
    }

    // Override in subclass
    initGame() {}

    pause() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            audio.playClick();
        }
    }

    resume() {
        if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            this.lastTime = performance.now();
            audio.playClick();
            this.loop(this.lastTime);
        }
    }

    stop() {
        this.state = 'GAMEOVER';
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    }

    gameOver() {
        this.stop();
        audio.playSuccess();
        if (typeof app !== 'undefined') {
            const timePlayed = this.workoutConfig.mode === 'TIME' ? (60 - this.timer) : this.timer;
            app.showGameSummary(this.score, this.totalReps || this.reps, timePlayed);
        }
    }

    loop(timestamp) {
        if (this.state !== 'PLAYING' && this.state !== 'COUNTDOWN' && this.state !== 'RESTING') return;

        const dt = (timestamp - this.lastTime) / 1000; // delta time in seconds
        this.lastTime = timestamp;

        this.update(dt);
        this.render();

        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
    }

    // Override in subclass
    update(dt) {
        if (this.state === 'COUNTDOWN') {
            this.countdownVal -= dt;
            const digit = Math.ceil(this.countdownVal);
            
            if (digit > 0 && digit !== this.lastCountDigit) {
                this.lastCountDigit = digit;
                audio.playClick();
            }

            if (this.countdownVal <= -0.5) { // show GO! for 0.5 seconds
                this.state = 'PLAYING';
                audio.playVoice("Go!");
                
                // Start the 60s game clock interval
                if (this.timerInterval) clearInterval(this.timerInterval);
                if (this.workoutConfig.mode === 'TIME') {
                    this.timerInterval = setInterval(() => {
                        if (this.state === 'PLAYING') {
                            this.timer--;
                            if (this.timer <= 0) {
                                this.gameOver();
                            }
                        }
                    }, 1000);
                } else {
                    this.timerInterval = setInterval(() => {
                        if (this.state === 'PLAYING') {
                            this.timer++; // track elapsed time
                        }
                    }, 1000);
                }
            }
        } else if (this.state === 'RESTING') {
            this.restCountdown -= dt;
            const digit = Math.ceil(this.restCountdown);
            if (digit > 0 && digit !== this.lastCountDigit) {
                this.lastCountDigit = digit;
                audio.playClick();
            }
            if (this.restCountdown <= 0) {
                this.currentSet++;
                this.reps = 0; // reset reps for next set
                this.state = 'COUNTDOWN';
                this.countdownVal = 3.0;
                this.lastCountDigit = 3;
            }
        }
    }

    drawCountdownOverlay() {
        const ctx = this.ctx;
        const count = Math.ceil(this.countdownVal);
        let text = "";
        let color = "var(--primary-cyan)";
        
        if (count > 0) {
            text = String(count);
            color = count === 3 ? "var(--primary-cyan)" : count === 2 ? "var(--accent-yellow)" : "var(--primary-neon-pink)";
        } else {
            text = "GO!";
            color = "var(--success-green)";
        }

        // Pulse scale animation based on fractional seconds left
        const fraction = this.countdownVal - Math.floor(this.countdownVal);
        const scale = 1.0 + (1.0 - fraction) * 0.3; // scale pulse
        const alpha = count > 0 ? fraction : (1.0 + this.countdownVal * 2.0); // fade out GO!

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.floor(70 * scale)}px "Press Start 2P", monospace`;
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        
        // Shadow glow
        ctx.shadowBlur = 25;
        ctx.shadowColor = color;
        
        ctx.fillText(text, this.width / 2, this.height * 0.45);
        ctx.restore();
    }

    drawRestingOverlay() {
        const ctx = this.ctx;
        const count = Math.ceil(this.restCountdown);
        
        ctx.save();
        ctx.fillStyle = 'rgba(9, 6, 17, 0.7)';
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.font = `24px "Press Start 2P", monospace`;
        ctx.fillStyle = 'var(--primary-cyan)';
        ctx.fillText("RESTING PHASE", this.width / 2, this.height * 0.35);

        ctx.font = `60px "Press Start 2P", monospace`;
        ctx.fillStyle = 'var(--success-green)';
        ctx.fillText(String(count), this.width / 2, this.height * 0.55);
        ctx.restore();
    }

    // Override in subclass
    render() {}

    // Utility: Draw pixel art text
    drawPixelText(text, x, y, size = 16, color = '#ffffff', align = 'left') {
        this.ctx.save();
        this.ctx.font = `${size}px "Press Start 2P", monospace`;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = align;
        this.ctx.fillText(text, x, y);
        this.ctx.restore();
    }

    // Utility: Draw glowing synthwave grid background
    drawSynthwaveGrid(scrollX) {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a071b';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw deep purple starfield
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let i = 0; i < 20; i++) {
            const starX = (Math.sin(i * 1234.56) * 0.5 + 0.5) * this.width;
            const starY = (Math.cos(i * 9876.54) * 0.5 + 0.5) * (this.height * 0.5);
            ctx.fillRect(starX, starY, 2, 2);
        }

        // Draw Neon Sun in the background
        const sunX = this.width / 2;
        const sunY = this.height * 0.45;
        const sunR = 70;
        const grad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
        grad.addColorStop(0, '#ff007f'); // Neon Pink
        grad.addColorStop(1, '#ffea00'); // Yellow
        
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ff007f';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, Math.PI, 0); // half circle top
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Horizontal sun lines
        ctx.fillStyle = '#0a071b';
        for (let y = sunY - 40; y < sunY; y += 8) {
            const thickness = Math.max(1, (sunY - y) / 4);
            ctx.fillRect(sunX - sunR - 10, y, (sunR + 10) * 2, thickness);
        }

        // Grid horizon
        const horizonY = this.height * 0.55;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(this.width, horizonY);
        ctx.stroke();

        // Grid lines (vertical perspective lines)
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        const numLines = 18;
        for (let i = 0; i <= numLines; i++) {
            const progress = i / numLines;
            // map progress to a centered perspective
            const startX = this.width * 0.1 + (this.width * 0.8) * progress;
            const targetX = -200 + (this.width + 400) * progress;
            ctx.beginPath();
            ctx.moveTo(startX, horizonY);
            ctx.lineTo(targetX, this.height);
            ctx.stroke();
        }

        // Horizontal grid lines (scrolling animation)
        const scrollSpeed = 120; // pixels per second
        const gridOffset = (scrollX * scrollSpeed) % 40;
        for (let y = horizonY; y < this.height; y += 20) {
            // perspective spacing
            const depth = (y - horizonY) / (this.height - horizonY);
            const py = horizonY + (this.height - horizonY) * Math.pow(depth, 1.8);
            
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.1 + depth * 0.5})`;
            ctx.beginPath();
            ctx.moveTo(0, py + gridOffset * depth);
            ctx.lineTo(this.width, py + gridOffset * depth);
            ctx.stroke();
        }
    }
}
