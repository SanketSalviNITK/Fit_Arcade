class RunnerGame extends GameEngine {
    constructor(canvasId) {
        super(canvasId);
    }

    initGame() {
        this.scrollX = 0;
        this.groundY = 440;

        // Player configuration
        this.player = {
            x: 150,
            y: this.groundY - 70,
            width: 40,
            height: 70,
            velocityY: 0,
            isJumping: false,
            isDucking: false,
            invincibleTime: 0, // seconds
            jumpForce: -680,
            gravity: 1600,
            animFrame: 0,
            animTimer: 0
        };

        // Obstacles array
        this.obstacles = [];
        this.obstacleSpawnTimer = 0;
        this.minSpawnInterval = 1.6; // seconds
        this.speedMultiplier = 1.0;

        // Rep tracking helpers
        this.userState = {
            wasSquatting: false,
            wasJumping: false
        };

        this.particles = [];
    }

    // Process MediaPipe inputs sent from the app level
    handlePose(posture) {
        if (this.state !== 'PLAYING') return;

        // 1. SQUAT / DUCK detection
        if (posture.isSquatting) {
            if (!this.player.isDucking && !this.player.isJumping) {
                this.player.isDucking = true;
                this.player.height = 35;
                this.player.y = this.groundY - 35;
                audio.playDuck();
            }
            
            // Track squat repetition on downward transition
            if (!this.userState.wasSquatting) {
                this.userState.wasSquatting = true;
            }
        } else {
            if (this.player.isDucking) {
                this.player.isDucking = false;
                this.player.height = 70;
                this.player.y = this.groundY - 70;
            }
            
            // Finalize squat rep when standing back up
            if (this.userState.wasSquatting) {
                this.userState.wasSquatting = false;
                this.reps++;
                this.score += 200 * this.combo;
                this.streak++;
                audio.playScore();
                this.createScorePop(this.player.x, this.player.y - 20, `+${200 * this.combo}`);
                this.checkSetCompletion();
            }
        }

        // 2. JUMP detection
        if (posture.isJumping) {
            if (!this.userState.wasJumping) {
                this.userState.wasJumping = true;
                if (!this.player.isJumping && !this.player.isDucking) {
                    this.player.isJumping = true;
                    this.player.velocityY = this.player.jumpForce;
                    audio.playJump();
                    this.reps++;
                    this.score += 200 * this.combo;
                    this.streak++;
                    this.createScorePop(this.player.x, this.player.y - 20, `+${200 * this.combo}`);
                    this.checkSetCompletion();
                }
            }
        } else {
            this.userState.wasJumping = false;
        }
    }

    checkSetCompletion() {
        this.totalReps = (this.totalReps || 0) + 1;
        if (this.workoutConfig.mode === 'REPS') {
            if (this.reps >= this.workoutConfig.targetReps) {
                if (this.currentSet >= this.workoutConfig.targetSets) {
                    this.gameOver();
                } else {
                    this.state = 'RESTING';
                    this.restCountdown = this.workoutConfig.restTime;
                    this.lastCountDigit = Math.ceil(this.restCountdown);
                    this.obstacles = []; // clear obstacles for rest
                }
            }
        }
    }

    // Manual Keyboard triggers for easier debugging/testing
    triggerManualJump() {
        if (this.state !== 'PLAYING') return;
        if (!this.player.isJumping && !this.player.isDucking) {
            this.player.isJumping = true;
            this.player.velocityY = this.player.jumpForce;
            audio.playJump();
            this.reps++;
            this.streak++;
            this.score += 200 * this.combo;
            this.createScorePop(this.player.x, this.player.y - 20, `+${200 * this.combo}`);
        }
    }

    triggerManualDuck(isDucking) {
        if (this.state !== 'PLAYING') return;
        if (isDucking) {
            if (!this.player.isDucking && !this.player.isJumping) {
                this.player.isDucking = true;
                this.player.height = 35;
                this.player.y = this.groundY - 35;
                audio.playDuck();
            }
        } else {
            if (this.player.isDucking) {
                this.player.isDucking = false;
                this.player.height = 70;
                this.player.y = this.groundY - 70;
                this.reps++;
                this.streak++;
                this.score += 200 * this.combo;
                audio.playScore();
                this.createScorePop(this.player.x, this.player.y - 20, `+${200 * this.combo}`);
            }
        }
    }

    update(dt) {
        super.update(dt);
        if (this.state === 'COUNTDOWN' || this.state === 'RESTING') {
            // Keep HUD synced during countdown/rest
            document.getElementById('hud-score').innerText = String(this.score).padStart(6, '0');
            document.getElementById('hud-multiplier').innerText = `${this.combo}X`;
            if (this.workoutConfig.mode === 'TIME') {
                document.getElementById('hud-time-container').style.display = 'block';
                document.getElementById('hud-reps-container').style.display = 'none';
                document.getElementById('hud-timer').innerText = `${this.timer}s`;
            } else {
                document.getElementById('hud-time-container').style.display = 'none';
                document.getElementById('hud-reps-container').style.display = 'block';
                document.getElementById('hud-set').innerText = `${this.currentSet}/${this.workoutConfig.targetSets}`;
                document.getElementById('hud-rep-count').innerText = `${this.reps}/${this.workoutConfig.targetReps}`;
            }
            return;
        }

        // Increment game speed slowly over time
        this.speedMultiplier = 1.0 + (60 - this.timer) * 0.008;

        // Scroll track background
        const baseSpeed = 300; // px/sec
        const currentSpeed = baseSpeed * this.speedMultiplier;
        this.scrollX += currentSpeed * dt;

        // Player Physics (Jumping)
        if (this.player.isJumping) {
            this.player.velocityY += this.player.gravity * dt;
            this.player.y += this.player.velocityY * dt;

            // Check ground collision
            const landY = this.groundY - this.player.height;
            if (this.player.y >= landY) {
                this.player.y = landY;
                this.player.velocityY = 0;
                this.player.isJumping = false;
                
                // Spawn land landing dust particles
                this.createLandParticles(this.player.x + this.player.width/2, this.groundY);
            }
        } else if (!this.player.isDucking) {
            // Running leg animation frames
            this.player.animTimer += dt;
            if (this.player.animTimer > 0.08) {
                this.player.animFrame = (this.player.animFrame + 1) % 4;
                this.player.animTimer = 0;
            }
        }

        // Decrement player invincibility frames
        if (this.player.invincibleTime > 0) {
            this.player.invincibleTime -= dt;
        }

        // Spawn obstacles
        this.obstacleSpawnTimer += dt;
        if (this.obstacleSpawnTimer > this.minSpawnInterval / this.speedMultiplier) {
            this.spawnObstacle();
            this.obstacleSpawnTimer = 0;
        }

        // Update obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.x -= currentSpeed * dt;

            // Check Collision (AABB bounding box)
            if (this.checkCollision(this.player, obs) && this.player.invincibleTime <= 0) {
                this.handleHit();
            }

            // Check if cleared
            if (!obs.cleared && obs.x + obs.width < this.player.x) {
                obs.cleared = true;
                this.score += 100 * this.combo;
                this.streak++;
                
                // Combo levels: 1X, 2X (streak 5), 3X (streak 10), 4X (streak 15)
                if (this.streak > 0 && this.streak % 5 === 0) {
                    this.combo = Math.min(4, Math.floor(this.streak / 5) + 1);
                    audio.playScore();
                    this.createComboPop(this.player.x + 30, this.player.y - 30, `${this.combo}X COMBO!`);
                }
            }

            // Remove off-screen obstacles
            if (obs.x + obs.width < 0) {
                this.obstacles.splice(i, 1);
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.alpha -= p.decay * dt;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Keep HUD stats synced with HTML elements
        document.getElementById('hud-score').innerText = String(this.score).padStart(6, '0');
        document.getElementById('hud-multiplier').innerText = `${this.combo}X`;
        
        if (this.workoutConfig.mode === 'TIME') {
            document.getElementById('hud-time-container').style.display = 'block';
            document.getElementById('hud-reps-container').style.display = 'none';
            document.getElementById('hud-timer').innerText = `${this.timer}s`;
        } else {
            document.getElementById('hud-time-container').style.display = 'none';
            document.getElementById('hud-reps-container').style.display = 'block';
            document.getElementById('hud-set').innerText = `${this.currentSet}/${this.workoutConfig.targetSets}`;
            document.getElementById('hud-rep-count').innerText = `${this.reps}/${this.workoutConfig.targetReps}`;
        }
    }

    spawnObstacle() {
        // Randomly pick a ground obstacle (Spike) or flying obstacle (Drone)
        const type = Math.random() > 0.4 ? 'SPIKE' : 'DRONE';
        
        let width, height, y;
        
        if (type === 'SPIKE') {
            width = 30 + Math.random() * 15; // 30-45px
            height = 40;
            y = this.groundY - height;
        } else {
            width = 40;
            height = 25;
            y = this.groundY - 85; // flying high, user must squat down to slide under
        }

        this.obstacles.push({
            x: this.width + 50,
            y: y,
            width: width,
            height: height,
            type: type,
            cleared: false
        });
    }

    checkCollision(rect1, rect2) {
        // Slightly shrink hitboxes for better feel
        const bufferX = 6;
        const bufferY = 4;
        return (
            rect1.x + bufferX < rect2.x + rect2.width &&
            rect1.x + rect1.width - bufferX > rect2.x &&
            rect1.y + bufferY < rect2.y + rect2.height &&
            rect1.y + rect1.height - bufferY > rect2.y
        );
    }

    handleHit() {
        this.player.invincibleTime = 1.2; // 1.2 seconds invincibility
        this.streak = 0;
        this.combo = 1;
        audio.playHit();
        
        // Spawn explosion particles
        this.createHitParticles(this.player.x + 20, this.player.y + 30);
    }

    // Procedural Particle Generators
    createLandParticles(x, y) {
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: x,
                y: y - 5,
                vx: (Math.random() - 0.5) * 150,
                vy: -Math.random() * 50 - 20,
                alpha: 1.0,
                decay: 2.0,
                color: 'rgba(0, 240, 255, 0.6)',
                size: 3 + Math.random() * 3
            });
        }
    }

    createHitParticles(x, y) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 300,
                vy: (Math.random() - 0.5) * 300,
                alpha: 1.0,
                decay: 2.5,
                color: 'rgba(255, 0, 127, 0.9)',
                size: 4 + Math.random() * 6
            });
        }
    }

    createScorePop(x, y, text) {
        this.particles.push({
            x: x,
            y: y,
            vx: 30,
            vy: -80,
            alpha: 1.2,
            decay: 1.0,
            text: text,
            color: 'var(--accent-yellow)',
            size: 11
        });
    }

    createComboPop(x, y, text) {
        this.particles.push({
            x: x,
            y: y,
            vx: 0,
            vy: -60,
            alpha: 1.5,
            decay: 0.8,
            text: text,
            color: 'var(--primary-neon-pink)',
            size: 14
        });
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // 1. Draw grid background
        this.drawSynthwaveGrid(this.scrollX / 100);

        // 2. Draw ground platform line
        ctx.strokeStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(this.width, this.groundY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 3. Draw obstacles (Glowing Synth Cyan blocks / Pink triangles)
        this.obstacles.forEach(obs => {
            ctx.save();
            ctx.shadowBlur = 12;
            if (obs.type === 'SPIKE') {
                ctx.fillStyle = '#ff007f'; // Pink spikes
                ctx.shadowColor = '#ff007f';
                ctx.beginPath();
                ctx.moveTo(obs.x, obs.y + obs.height);
                ctx.lineTo(obs.x + obs.width/2, obs.y);
                ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillStyle = '#ffea00'; // Yellow glowing drone block
                ctx.shadowColor = '#ffea00';
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                // Draw details on the drone
                ctx.fillStyle = '#0a071b';
                ctx.fillRect(obs.x + 5, obs.y + 5, 8, 8);
                ctx.fillRect(obs.x + obs.width - 13, obs.y + 5, 8, 8);
            }
            ctx.restore();
        });

        // 4. Draw player athlete (Procedural pixel skeleton guy)
        if (this.player.invincibleTime <= 0 || Math.floor(performance.now() / 80) % 2 === 0) {
            this.drawPlayer(ctx);
        }

        // 5. Draw particles (Pops & Sprays)
        this.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
            if (p.text) {
                ctx.font = `${p.size}px "Press Start 2P", monospace`;
                ctx.fillStyle = p.color;
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 5;
                ctx.fillRect(p.x, p.y, p.size, p.size);
            }
            ctx.restore();
        });

        // 6. Draw Countdown overlay
        if (this.state === 'COUNTDOWN') {
            this.drawCountdownOverlay();
        } else if (this.state === 'RESTING') {
            this.drawRestingOverlay();
        }
    }

    drawPlayer(ctx) {
        const p = this.player;
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f0ff';
        ctx.fillStyle = '#00f0ff'; // neon cyan player

        if (p.isDucking) {
            // Draw squashed runner slide shape
            ctx.fillRect(p.x, p.y, p.width, p.height);
            // Head block
            ctx.fillRect(p.x + p.width - 12, p.y - 12, 12, 12);
        } else if (p.isJumping) {
            // Draw jump pose
            ctx.fillRect(p.x + 5, p.y, p.width - 10, p.height - 15);
            // Head
            ctx.fillRect(p.x + p.width/2 - 8, p.y - 16, 16, 16);
            // Legs (tucked up)
            ctx.fillStyle = '#ff007f';
            ctx.fillRect(p.x + 2, p.y + p.height - 15, 12, 15);
            ctx.fillRect(p.x + p.width - 14, p.y + p.height - 15, 12, 15);
        } else {
            // Running stance animation frames
            // Torso
            ctx.fillRect(p.x + 10, p.y + 16, p.width - 20, 36);
            // Head
            ctx.fillRect(p.x + p.width/2 - 8, p.y, 16, 16);
            
            // Legs cycling
            ctx.fillStyle = '#ff007f'; // Hot pink accents
            if (p.animFrame === 0) {
                // Leg A back, Leg B front
                ctx.fillRect(p.x + 5, p.y + 52, 10, 18);
                ctx.fillRect(p.x + p.width - 15, p.y + 52, 10, 12);
            } else if (p.animFrame === 1) {
                // Stride
                ctx.fillRect(p.x, p.y + 52, 12, 12);
                ctx.fillRect(p.x + p.width - 12, p.y + 52, 12, 12);
            } else if (p.animFrame === 2) {
                // Leg A front, Leg B back
                ctx.fillRect(p.x + 5, p.y + 52, 10, 12);
                ctx.fillRect(p.x + p.width - 15, p.y + 52, 10, 18);
            } else {
                // Mid
                ctx.fillRect(p.x + 8, p.y + 52, 24, 10);
            }
        }
        ctx.restore();
    }
}
