class SpaceShieldGame extends GameEngine {
    constructor(canvasId) {
        super(canvasId);
    }

    initGame() {
        // Ship configuration
        this.ship = {
            width: 50,
            height: 60,
            x: this.width / 2 - 25,
            y: this.height - 80,
            speed: 500, // pixels per second
            vx: 0,
            invincibleTime: 0
        };

        this.lasers = [];
        this.enemies = [];
        this.particles = [];
        
        this.lastFireTime = 0;
        this.fireCooldown = 0.4; // 400ms between shots

        this.enemySpawnTimer = 0;
        this.minSpawnInterval = 1.2;

        this.userState = {
            wasFiring: false
        };

        this.starYOffset = 0;
    }

    handlePose(posture) {
        if (this.state !== 'PLAYING') return;

        // Steering: Left Arm Up = Left, Right Arm Up = Right
        if (posture.leftArmSide && !posture.rightArmSide) {
            this.ship.vx = -this.ship.speed;
        } else if (posture.rightArmSide && !posture.leftArmSide) {
            this.ship.vx = this.ship.speed;
        } else {
            // Both up or both down = stop
            this.ship.vx = 0;
        }

        // Firing: Double Punch (armsFront)
        if (posture.armsFront) {
            if (!this.userState.wasFiring && (performance.now() - this.lastFireTime) / 1000 > this.fireCooldown) {
                this.fireLaser();
                this.userState.wasFiring = true;
                this.lastFireTime = performance.now();
                
                // Track rep for shooting
                this.reps++;
                this.checkSetCompletion();
            }
        } else {
            this.userState.wasFiring = false;
        }
    }

    fireLaser() {
        audio.playJump(); // Reuse jump sound or create a new shoot sound
        // Dual lasers
        this.lasers.push({
            x: this.ship.x + 5,
            y: this.ship.y,
            width: 6,
            height: 20,
            vy: -800
        });
        this.lasers.push({
            x: this.ship.x + this.ship.width - 11,
            y: this.ship.y,
            width: 6,
            height: 20,
            vy: -800
        });
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
                    this.enemies = [];
                    this.lasers = [];
                }
            }
        }
    }

    update(dt) {
        super.update(dt);
        if (this.state === 'COUNTDOWN' || this.state === 'RESTING') {
            this.updateHUD();
            return;
        }

        // Scroll background
        this.starYOffset += 200 * dt;

        // Player physics
        this.ship.x += this.ship.vx * dt;
        // Bounds checking
        if (this.ship.x < 0) this.ship.x = 0;
        if (this.ship.x > this.width - this.ship.width) this.ship.x = this.width - this.ship.width;

        if (this.ship.invincibleTime > 0) {
            this.ship.invincibleTime -= dt;
        }

        // Update lasers
        for (let i = this.lasers.length - 1; i >= 0; i--) {
            let l = this.lasers[i];
            l.y += l.vy * dt;
            if (l.y + l.height < 0) {
                this.lasers.splice(i, 1);
            }
        }

        // Spawn enemies
        this.enemySpawnTimer += dt;
        let currentSpawnInterval = Math.max(0.4, this.minSpawnInterval - (60 - this.timer) * 0.015);
        if (this.enemySpawnTimer > currentSpawnInterval) {
            this.spawnEnemy();
            this.enemySpawnTimer = 0;
        }

        // Update enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            let e = this.enemies[i];
            e.y += e.vy * dt;
            
            // Asteroid rotation
            e.rotation += e.rotationSpeed * dt;

            // Collision with ship
            if (this.checkCollision(this.ship, e) && this.ship.invincibleTime <= 0) {
                this.handleShipHit();
            }

            // Remove if off screen
            if (e.y > this.height) {
                this.enemies.splice(i, 1);
                // Lose combo if enemy missed
                this.streak = 0;
                this.combo = 1;
                continue;
            }

            // Collision with lasers
            let hit = false;
            for (let j = this.lasers.length - 1; j >= 0; j--) {
                let l = this.lasers[j];
                if (this.checkCollision(e, l)) {
                    this.lasers.splice(j, 1);
                    hit = true;
                    break;
                }
            }

            if (hit) {
                this.createExplosion(e.x + e.width/2, e.y + e.height/2);
                this.enemies.splice(i, 1);
                
                this.score += 150 * this.combo;
                this.streak++;
                if (this.streak > 0 && this.streak % 5 === 0) {
                    this.combo = Math.min(4, Math.floor(this.streak / 5) + 1);
                    audio.playScore();
                } else {
                    audio.playDuck(); // gentle pop sound
                }
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.alpha -= p.decay * dt;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        this.updateHUD();
    }

    updateHUD() {
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

    spawnEnemy() {
        let size = 40 + Math.random() * 30;
        this.enemies.push({
            x: Math.random() * (this.width - size),
            y: -size,
            width: size,
            height: size,
            vy: 200 + Math.random() * 200,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 4,
            points: this.generateAsteroidPoints(size/2)
        });
    }

    generateAsteroidPoints(radius) {
        let pts = [];
        let numPts = 8;
        for (let i=0; i<numPts; i++) {
            let angle = (i / numPts) * Math.PI * 2;
            let r = radius * (0.7 + Math.random() * 0.3);
            pts.push({ x: Math.cos(angle)*r, y: Math.sin(angle)*r });
        }
        return pts;
    }

    checkCollision(rect1, rect2) {
        let buffer = 5;
        return (
            rect1.x + buffer < rect2.x + rect2.width &&
            rect1.x + rect1.width - buffer > rect2.x &&
            rect1.y + buffer < rect2.y + rect2.height &&
            rect1.y + rect1.height - buffer > rect2.y
        );
    }

    handleShipHit() {
        this.ship.invincibleTime = 1.5;
        this.streak = 0;
        this.combo = 1;
        audio.playHit();
        this.createExplosion(this.ship.x + this.ship.width/2, this.ship.y + this.ship.height/2, 'rgba(255, 0, 127, 0.9)');
    }

    createExplosion(x, y, color = 'rgba(0, 240, 255, 0.8)') {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 400,
                vy: (Math.random() - 0.5) * 400,
                alpha: 1.0,
                decay: 1.5 + Math.random(),
                color: color,
                size: 3 + Math.random() * 5
            });
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // Background
        ctx.fillStyle = '#050214';
        ctx.fillRect(0, 0, this.width, this.height);

        // Vertical space scrolling background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < 40; i++) {
            let starX = (Math.sin(i * 314.15) * 0.5 + 0.5) * this.width;
            let starY = ((Math.cos(i * 271.8) * 0.5 + 0.5) * this.height + this.starYOffset * (0.2 + (i%3)*0.2)) % this.height;
            ctx.fillRect(starX, starY, i%3+1, i%3+1);
        }

        // Draw Ship
        if (this.ship.invincibleTime <= 0 || Math.floor(performance.now() / 80) % 2 === 0) {
            ctx.save();
            ctx.translate(this.ship.x + this.ship.width/2, this.ship.y + this.ship.height/2);
            
            // Banking tilt
            let tilt = (this.ship.vx / this.ship.speed) * 0.3;
            ctx.rotate(tilt);

            // Synthwave ship shape
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00f0ff';
            ctx.fillStyle = '#0a071b';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 3;

            ctx.beginPath();
            ctx.moveTo(0, -this.ship.height/2); // nose
            ctx.lineTo(this.ship.width/2, this.ship.height/2); // right wing
            ctx.lineTo(0, this.ship.height/4); // bottom center
            ctx.lineTo(-this.ship.width/2, this.ship.height/2); // left wing
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Thruster flame
            if (this.state === 'PLAYING') {
                ctx.fillStyle = '#ff007f';
                ctx.shadowColor = '#ff007f';
                ctx.beginPath();
                ctx.moveTo(-10, this.ship.height/4 + 2);
                ctx.lineTo(10, this.ship.height/4 + 2);
                ctx.lineTo(0, this.ship.height/2 + Math.random()*20 + 10);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        }

        // Draw Lasers
        ctx.fillStyle = '#ff007f';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff007f';
        this.lasers.forEach(l => {
            ctx.fillRect(l.x, l.y, l.width, l.height);
        });

        // Draw Enemies (Asteroids)
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffea00';
        ctx.strokeStyle = '#ffea00';
        ctx.fillStyle = '#0a071b';
        ctx.lineWidth = 3;
        
        this.enemies.forEach(e => {
            ctx.save();
            ctx.translate(e.x + e.width/2, e.y + e.height/2);
            ctx.rotate(e.rotation);
            ctx.beginPath();
            for (let i=0; i<e.points.length; i++) {
                if (i===0) ctx.moveTo(e.points[i].x, e.points[i].y);
                else ctx.lineTo(e.points[i].x, e.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // Draw Particles
        this.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.restore();
        });

        if (this.state === 'COUNTDOWN') {
            this.drawCountdownOverlay();
        } else if (this.state === 'RESTING') {
            this.drawRestingOverlay();
        }
    }
}
