class ClimbGame extends GameEngine {
    constructor(canvasId, level = 1) {
        super(canvasId);
        this.level = level;
    }

    initGame() {
        this.scrollY = 0;
        this.scrollSpeed = 0;
        
        // Target columns for holds
        this.cols = [340, 480, 620];

        // Player coordinate structure
        this.player = {
            x: 480, // Target center X
            y: 350, // Fixed height Y
            width: 50,
            height: 75,
            targetX: 480,
            invincibleTime: 0,
            activeHand: 'LEFT', // 'LEFT' or 'RIGHT' is currently holding us
            leftHand: { x: 440, y: 320, state: 'GRIP' },
            rightHand: { x: 520, y: 320, state: 'GRIP' },
            legAngle: 0,
            legSwingTimer: 0
        };

        // Calibration baseline reference values
        this.reachState = {
            leftExtended: false,
            rightExtended: false,
            lastLeftReachY: 0,
            lastRightReachY: 0
        };

        // Handholds list
        this.holds = [];
        this.nextHoldIndex = 0;
        this.targetHold = null; // The hold the player needs to grab next

        // Obstacles (Falling cyber-bricks)
        this.debris = [];
        this.debrisSpawnTimer = 0;
        this.minSpawnInterval = 2.0;

        // Particle sprays
        this.particles = [];

        // Setup initial handholds
        this.spawnInitialHolds();
    }

    spawnInitialHolds() {
        // Create a ladder of initial holds
        let startY = 350;
        for (let i = 0; i < 6; i++) {
            const colIdx = (i % 2 === 0) ? 0 : 2; // Alternating columns (left and right)
            const holdY = startY - i * 150;
            const hold = {
                id: i,
                x: this.cols[colIdx],
                y: holdY,
                col: colIdx,
                grabbedBy: null
            };
            this.holds.push(hold);
        }
        
        // Lock player onto hold 0 (Left hand on Col 0)
        this.holds[0].grabbedBy = 'LEFT';
        this.player.leftHand.x = this.holds[0].x;
        this.player.leftHand.y = this.holds[0].y;
        this.player.leftHand.state = 'GRIP';
        this.player.activeHand = 'LEFT';

        // Set target hold to hold 1
        this.targetHold = this.holds[1];
        this.nextHoldIndex = 2;
    }

    spawnNewHold() {
        // Spawn a new hold above the highest hold
        const highestHold = this.holds[this.holds.length - 1];
        const nextY = highestHold.y - 150;
        
        // Random column that is different from the target column to keep the climber zigzagging
        let nextColIdx = Math.floor(Math.random() * 3);
        if (nextColIdx === this.targetHold.col) {
            nextColIdx = (nextColIdx + 1) % 3;
        }

        this.holds.push({
            id: this.nextHoldIndex++,
            x: this.cols[nextColIdx],
            y: nextY,
            col: nextColIdx,
            grabbedBy: null
        });
    }

    // Translate MediaPipe pose wrists and shoulders coordinates to climbing motions
    handlePose(posture, results) {
        if (this.state !== 'PLAYING') return;
        if (!results || !results.poseLandmarks) return;

        const landmarks = results.poseLandmarks;
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        // 1. TORSO LEAN DETECT (Dodging falling cyber-bricks)
        if (leftShoulder && rightShoulder && leftHip && rightHip) {
            const shoulderCX = (leftShoulder.x + rightShoulder.x) / 2;
            const hipCX = (leftHip.x + rightHip.x) / 2;
            const leanX = hipCX - shoulderCX; // Mirrored coordinate offset
            
            let leftLimit = (poseDetector.baselines.leanLeftThreshold < -0.01) ? poseDetector.baselines.leanLeftThreshold * 0.75 : -0.04;
            let rightLimit = (poseDetector.baselines.leanRightThreshold > 0.01) ? poseDetector.baselines.leanRightThreshold * 0.75 : 0.04;
            
            if (leanX > rightLimit) {
                // Lean Right (since camera mirrored, user leans to their right, shoulder shifts right)
                this.player.targetX = 480 + 100;
            } else if (leanX < leftLimit) {
                // Lean Left
                this.player.targetX = 480 - 100;
            } else {
                // Center
                this.player.targetX = 480;
            }
        }

        // 2. REACHING & PULLING DETECT (Alternating Lat Pull-downs)
        if (leftShoulder && rightShoulder && leftWrist && rightWrist) {
            // Calculate relative wrist vertical displacement (above shoulder Y coordinate decreases)
            const leftReach = leftShoulder.y - leftWrist.y;
            const rightReach = rightShoulder.y - rightWrist.y;

            // Compute dynamic thresholds from calibrated comfortable max reach
            const calibratedMaxReach = poseDetector.baselines.maxReachY || 0.15;
            const reachThreshold = calibratedMaxReach * 0.55; // Need to reach 55% of max extension
            const pullThreshold = calibratedMaxReach * 0.40;  // More forgiving pull (hand stays in camera frame)

            if (this.level === 2) {
                // Directional reaching
                let handReq = '';
                let leanReqOk = false;
                
                if (this.targetHold.x < 480) { // Left column
                    handReq = 'LEFT';
                    leanReqOk = (this.player.targetX < 480);
                } else if (this.targetHold.x > 480) { // Right column
                    handReq = 'RIGHT';
                    leanReqOk = (this.player.targetX > 480);
                } else { // Center column
                    handReq = 'BOTH';
                    leanReqOk = (this.player.targetX === 480);
                }

                if (handReq === 'LEFT') {
                    if (leanReqOk) {
                        if (leftReach > reachThreshold) {
                            if (!this.reachState.leftExtended) {
                                this.reachState.leftExtended = true;
                                this.player.leftHand.state = 'REACH';
                                audio.playClick();
                            }
                            this.player.leftHand.x = this.targetHold.x;
                            this.player.leftHand.y = this.targetHold.y;
                        }
                        if (this.reachState.leftExtended && leftReach < pullThreshold) {
                            this.executeClimbStroke('LEFT');
                        }
                    } else if (this.reachState.leftExtended) {
                        this.reachState.leftExtended = false;
                        this.player.leftHand.state = 'GRIP';
                    }
                } else if (handReq === 'RIGHT') {
                    if (leanReqOk) {
                        if (rightReach > reachThreshold) {
                            if (!this.reachState.rightExtended) {
                                this.reachState.rightExtended = true;
                                this.player.rightHand.state = 'REACH';
                                audio.playClick();
                            }
                            this.player.rightHand.x = this.targetHold.x;
                            this.player.rightHand.y = this.targetHold.y;
                        }
                        if (this.reachState.rightExtended && rightReach < pullThreshold) {
                            this.executeClimbStroke('RIGHT');
                        }
                    } else if (this.reachState.rightExtended) {
                        this.reachState.rightExtended = false;
                        this.player.rightHand.state = 'GRIP';
                    }
                } else if (handReq === 'BOTH') {
                    if (leanReqOk) {
                        if (leftReach > reachThreshold && rightReach > reachThreshold) {
                            if (!this.reachState.leftExtended || !this.reachState.rightExtended) {
                                this.reachState.leftExtended = true;
                                this.reachState.rightExtended = true;
                                this.player.leftHand.state = 'REACH';
                                this.player.rightHand.state = 'REACH';
                                audio.playClick();
                            }
                            // Snap both hands to target hold
                            this.player.leftHand.x = this.targetHold.x - 15;
                            this.player.leftHand.y = this.targetHold.y;
                            this.player.rightHand.x = this.targetHold.x + 15;
                            this.player.rightHand.y = this.targetHold.y;
                        }
                        // Execute pull when BOTH are pulled down
                        if (this.reachState.leftExtended && this.reachState.rightExtended && leftReach < pullThreshold && rightReach < pullThreshold) {
                            this.executeClimbStroke('BOTH');
                        }
                    } else {
                        if (this.reachState.leftExtended) {
                            this.reachState.leftExtended = false;
                            this.player.leftHand.state = 'GRIP';
                        }
                        if (this.reachState.rightExtended) {
                            this.reachState.rightExtended = false;
                            this.player.rightHand.state = 'GRIP';
                        }
                    }
                }
            } else {
                // Determine which arm needs to reach next based on active gripping hand
                const nextHand = (this.player.activeHand === 'LEFT') ? 'RIGHT' : 'LEFT';
                
                if (nextHand === 'RIGHT') {
                    // Player needs to reach with Right hand
                    if (rightReach > reachThreshold) { 
                        if (!this.reachState.rightExtended) {
                            this.reachState.rightExtended = true;
                            this.player.rightHand.state = 'REACH';
                            audio.playClick();
                        }
                        
                        // Snap Right hand to target hold
                        this.player.rightHand.x = this.targetHold.x;
                        this.player.rightHand.y = this.targetHold.y;
                    }

                    // Execute climb pull-down
                    if (this.reachState.rightExtended && rightReach < pullThreshold) {
                        this.executeClimbStroke('RIGHT');
                    }
                } else {
                    // Player needs to reach with Left hand
                    if (leftReach > reachThreshold) { 
                        if (!this.reachState.leftExtended) {
                            this.reachState.leftExtended = true;
                            this.player.leftHand.state = 'REACH';
                            audio.playClick();
                        }

                        // Snap Left hand to target hold
                        this.player.leftHand.x = this.targetHold.x;
                        this.player.leftHand.y = this.targetHold.y;
                    }

                    // Execute climb pull-down
                    if (this.reachState.leftExtended && leftReach < pullThreshold) {
                        this.executeClimbStroke('LEFT');
                    }
                }
            }
        }
    }

    // Manual Keyboard Fallback controls for debugging & ease of development
    triggerManualJump() {
        // In climbing game, Space performs a temporary quick climb leap
        if (this.state !== 'PLAYING') return;
        const handToClimb = (this.player.activeHand === 'LEFT') ? 'RIGHT' : 'LEFT';
        this.executeClimbStroke(handToClimb);
    }

    triggerManualDuck(isLeaning) {
        if (this.state !== 'PLAYING') return;
        // Duck key down ArrowDown Centers
    }

    // Helper steering bindings called by app.js keyboard listener
    steerLeft() {
        if (this.state === 'PLAYING') this.player.targetX = 480 - 100;
    }

    steerRight() {
        if (this.state === 'PLAYING') this.player.targetX = 480 + 100;
    }

    steerCenter() {
        if (this.state === 'PLAYING') this.player.targetX = 480;
    }

    executeClimbStroke(hand) {
        // Clear previous grabs by this hand
        if (hand === 'BOTH') {
            this.holds.forEach(h => { h.grabbedBy = null; });
            this.targetHold.grabbedBy = 'BOTH';
            this.player.activeHand = 'BOTH';
        } else {
            this.holds.forEach(h => {
                if (h.grabbedBy === hand || h.grabbedBy === 'BOTH') {
                    h.grabbedBy = null;
                }
            });
            this.targetHold.grabbedBy = hand;
            this.player.activeHand = hand;
        }

        // Reset reaches
        this.reachState.leftExtended = false;
        this.reachState.rightExtended = false;
        
        this.player.leftHand.state = 'GRIP';
        this.player.rightHand.state = 'GRIP';

        // Trigger vertical scroll thrust dynamically based on distance
        // Deceleration is 1000px/s^2. We want to stop exactly when targetHold.y reaches player.y
        const distanceToScroll = Math.max(0, this.player.y - this.targetHold.y);
        this.scrollSpeed = Math.sqrt(2000 * distanceToScroll);
        
        // Ensure a minimum visual thrust
        if (this.scrollSpeed < 200) this.scrollSpeed = 200;

        // Increment workout repetition counter
        this.reps++;
        this.score += 250 * this.combo;
        this.streak++;

        audio.playScore();
        this.createClimbParticles(this.targetHold.x, this.targetHold.y);
        this.createScorePop(this.player.x, this.player.y - 30, `+${250 * this.combo}`);

        // Update Combo levels
        if (this.streak > 0 && this.streak % 4 === 0) {
            this.combo = Math.min(4, Math.floor(this.streak / 4) + 1);
            this.createComboPop(this.player.x, this.player.y - 50, `${this.combo}X COMBO!`);
        }

        // Shift holds ladder index
        const currentTargetId = this.targetHold.id;
        this.targetHold = this.holds.find(h => h.id === currentTargetId + 1);

        // Spawn a new hold on top of stack
        this.spawnNewHold();
    }

    update(dt) {
        super.update(dt);
        if (this.state === 'COUNTDOWN') {
            // Keep HUD synced during countdown
            document.getElementById('hud-score').innerText = String(this.score).padStart(6, '0');
            document.getElementById('hud-multiplier').innerText = `${this.combo}X`;
            document.getElementById('hud-timer').innerText = `${this.timer}s`;
            return;
        }

        // 1. Lerp scroll speed down (simulates gravity slowing momentum)
        if (this.scrollSpeed > 0) {
            this.scrollY += this.scrollSpeed * dt;
            this.scrollSpeed -= 1000 * dt; // quick deceleration
            if (this.scrollSpeed < 0) this.scrollSpeed = 0;
        }

        // Smoothly slide climber horizontally based on lean coordinates
        this.player.x += (this.player.targetX - this.player.x) * 8 * dt;

        // 2. Adjust coordinate positions of holds as grid scrolls down
        const displacementY = this.scrollSpeed * dt;
        this.holds.forEach(hold => {
            hold.y += displacementY;
        });

        // Delete offscreen holds
        for (let i = this.holds.length - 1; i >= 0; i--) {
            if (this.holds[i].y > this.height + 100) {
                this.holds.splice(i, 1);
            }
        }

        // 3. Anchor climber hands positions relative to gripped holds
        let leftHolding = false;
        let rightHolding = false;
        
        this.holds.forEach(hold => {
            if (hold.grabbedBy === 'LEFT') {
                if (hold.y > this.player.y + 150) {
                    hold.grabbedBy = null; // Auto-release holds that are too far down
                } else {
                    this.player.leftHand.x = hold.x;
                    this.player.leftHand.y = hold.y;
                    leftHolding = true;
                }
            } else if (hold.grabbedBy === 'RIGHT') {
                if (hold.y > this.player.y + 150) {
                    hold.grabbedBy = null;
                } else {
                    this.player.rightHand.x = hold.x;
                    this.player.rightHand.y = hold.y;
                    rightHolding = true;
                }
            } else if (hold.grabbedBy === 'BOTH') {
                if (hold.y > this.player.y + 150) {
                    hold.grabbedBy = null;
                } else {
                    this.player.leftHand.x = hold.x - 15;
                    this.player.leftHand.y = hold.y;
                    this.player.rightHand.x = hold.x + 15;
                    this.player.rightHand.y = hold.y;
                    leftHolding = true;
                    rightHolding = true;
                }
            }
        });

        // Also anchor reaching hands to the target hold so they don't slide during scrolling
        if (this.player.leftHand.state === 'REACH' && this.targetHold) {
            this.player.leftHand.x = this.targetHold.x;
            this.player.leftHand.y = this.targetHold.y;
        }
        if (this.player.rightHand.state === 'REACH' && this.targetHold) {
            this.player.rightHand.x = this.targetHold.x;
            this.player.rightHand.y = this.targetHold.y;
        }

        // If a hand is not gripping a hold, and not reaching, keep it relaxed near shoulder height
        if (!leftHolding && this.player.leftHand.state !== 'REACH') {
            this.player.leftHand.x = this.player.x - 25;
            this.player.leftHand.y = this.player.y + 10;
        }
        if (!rightHolding && this.player.rightHand.state !== 'REACH') {
            this.player.rightHand.x = this.player.x + 25;
            this.player.rightHand.y = this.player.y + 10;
        }

        // 4. Update falling brick obstacles (Cyber Debris)
        this.debrisSpawnTimer += dt;
        const speedMultiplier = 1.0 + (60 - this.timer) * 0.01;
        if (this.debrisSpawnTimer > this.minSpawnInterval / speedMultiplier) {
            this.spawnDebris();
            this.debrisSpawnTimer = 0;
        }

        for (let i = this.debris.length - 1; i >= 0; i--) {
            const block = this.debris[i];
            block.y += block.vy * speedMultiplier * dt;

            // Check AABB collision with climber torso
            if (this.checkCollision(this.player, block) && this.player.invincibleTime <= 0) {
                this.handleHit();
            }

            // Remove if off screen
            if (block.y > this.height) {
                this.debris.splice(i, 1);
            }
        }

        // Decrement player invincibility frames
        if (this.player.invincibleTime > 0) {
            this.player.invincibleTime -= dt;
        }

        // 5. Update pendulum legs animation swings
        this.player.legSwingTimer += dt;
        const swingSpeed = (this.scrollSpeed > 0) ? 12 : 4;
        this.player.legAngle = Math.sin(this.player.legSwingTimer * swingSpeed) * 0.25;

        // 6. Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.alpha -= p.decay * dt;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update HUD HTML metrics
        document.getElementById('hud-score').innerText = String(this.score).padStart(6, '0');
        document.getElementById('hud-multiplier').innerText = `${this.combo}X`;
        document.getElementById('hud-timer').innerText = `${this.timer}s`;
    }

    spawnDebris() {
        // Spawn falling hazard in one of the columns
        const colIdx = Math.floor(Math.random() * 3);
        const width = 45;
        const height = 45;
        this.debris.push({
            x: this.cols[colIdx] - width/2,
            y: -50,
            width: width,
            height: height,
            vy: 250 + Math.random() * 150
        });
    }

    checkCollision(rect1, rect2) {
        // Narrow the climber's horizontal body profile for fairer dodging feels
        const bodyBufferX = 12;
        return (
            rect1.x + bodyBufferX < rect2.x + rect2.width &&
            rect1.x + rect1.width - bodyBufferX > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    }

    handleHit() {
        this.player.invincibleTime = 1.2;
        this.streak = 0;
        this.combo = 1;
        audio.playHit();
        this.createHitParticles(this.player.x + 25, this.player.y + 35);
    }

    // Particle Sprays
    createClimbParticles(x, y) {
        for (let i = 0; i < 10; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 180,
                vy: (Math.random() - 0.5) * 180,
                alpha: 1.0,
                decay: 2.0,
                color: 'rgba(0, 240, 255, 0.7)',
                size: 2 + Math.random() * 4
            });
        }
    }

    createHitParticles(x, y) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 320,
                vy: (Math.random() - 0.5) * 320,
                alpha: 1.0,
                decay: 2.2,
                color: 'rgba(255, 0, 127, 0.9)',
                size: 3 + Math.random() * 6
            });
        }
    }

    createScorePop(x, y, text) {
        this.particles.push({
            x: x + 20,
            y: y,
            vx: 30,
            vy: -70,
            alpha: 1.2,
            decay: 1.0,
            text: text,
            color: 'var(--accent-yellow)',
            size: 11
        });
    }

    createComboPop(x, y, text) {
        this.particles.push({
            x: x + 20,
            y: y,
            vx: 0,
            vy: -50,
            alpha: 1.5,
            decay: 0.8,
            text: text,
            color: 'var(--primary-neon-pink)',
            size: 13
        });
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // 1. Draw scrolling vertical grid background
        this.drawVerticalGrid();

        // 2. Draw Climber handholds (Neon circles)
        this.holds.forEach(hold => {
            ctx.save();
            ctx.shadowBlur = 10;
            
            const isWide = (this.level === 2 && hold.x === 480);
            
            if (this.targetHold && hold.id === this.targetHold.id) {
                // Pulsing yellow highlight for active target
                const pulse = 1.0 + Math.sin(performance.now() * 0.01) * 0.25;
                ctx.fillStyle = 'var(--accent-yellow)';
                ctx.shadowColor = 'var(--accent-yellow)';
                ctx.beginPath();
                if (isWide) {
                    ctx.roundRect(hold.x - 20 * pulse, hold.y - 10 * pulse, 40 * pulse, 20 * pulse, 10 * pulse);
                } else {
                    ctx.arc(hold.x, hold.y, 10 * pulse, 0, Math.PI * 2);
                }
                ctx.fill();
            } else {
                ctx.fillStyle = hold.grabbedBy ? 'var(--primary-cyan)' : 'rgba(255, 255, 255, 0.4)';
                ctx.shadowColor = hold.grabbedBy ? 'var(--primary-cyan)' : 'rgba(255, 255, 255, 0.2)';
                ctx.beginPath();
                if (isWide) {
                    ctx.roundRect(hold.x - 16, hold.y - 8, 32, 16, 8);
                } else {
                    ctx.arc(hold.x, hold.y, 8, 0, Math.PI * 2);
                }
                ctx.fill();
            }
            ctx.restore();
        });

        // 3. Draw falling hazards (Glowing orange-red blocks)
        this.debris.forEach(block => {
            ctx.save();
            ctx.fillStyle = 'var(--primary-neon-pink)';
            ctx.strokeStyle = '#fff';
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'var(--primary-neon-pink)';
            ctx.lineWidth = 2;
            
            // Draw cross-grid styled hazard box
            ctx.fillRect(block.x, block.y, block.width, block.height);
            ctx.strokeRect(block.x, block.y, block.width, block.height);
            
            // Neon warning label inside
            ctx.fillStyle = '#0a071b';
            ctx.fillRect(block.x + 10, block.y + 10, block.width - 20, block.height - 20);
            ctx.restore();
        });

        // 4. Draw Climber character (neon blue body, swinging leg hinges, connecting arm cables)
        if (this.player.invincibleTime <= 0 || Math.floor(performance.now() / 80) % 2 === 0) {
            this.drawClimber(ctx);
        }

        // 5. Draw particle sprays
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

        // 6. Draw Countdown overlay if active
        if (this.state === 'COUNTDOWN') {
            this.drawCountdownOverlay();
        }
    }

    drawVerticalGrid() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0a071b';
        ctx.fillRect(0, 0, this.width, this.height);

        // Slow falling background nebula dots
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let i = 0; i < 15; i++) {
            const starX = (Math.sin(i * 456.78) * 0.5 + 0.5) * this.width;
            const starY = ((Math.cos(i * 876.54) * 0.5 + 0.5) * this.height + this.scrollY * 0.3) % this.height;
            ctx.fillRect(starX, starY, 2, 2);
        }

        // Draw vertical neon-grid track lines (Columns)
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.lineWidth = 2;
        this.cols.forEach(x => {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        });

        // Draw horizontal moving neon grid lines
        const lineInterval = 100;
        const lineOffset = this.scrollY % lineInterval;
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let y = lineOffset; y < this.height; y += lineInterval) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
    }

    drawClimber(ctx) {
        const p = this.player;

        // 1. Draw arm cables (Neon lines connecting torso to hands)
        ctx.save();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f0ff';

        // Left Arm Cable
        ctx.beginPath();
        ctx.moveTo(p.x + 10, p.y + 15);
        // elbow midpoint
        const leftElbowX = (p.x + 10 + p.leftHand.x) / 2 - 10;
        const leftElbowY = (p.y + 15 + p.leftHand.y) / 2 + 10;
        ctx.lineTo(leftElbowX, leftElbowY);
        ctx.lineTo(p.leftHand.x, p.leftHand.y);
        ctx.stroke();

        // Right Arm Cable
        ctx.beginPath();
        ctx.moveTo(p.x + p.width - 10, p.y + 15);
        // elbow midpoint
        const rightElbowX = (p.x + p.width - 10 + p.rightHand.x) / 2 + 10;
        const rightElbowY = (p.y + 15 + p.rightHand.y) / 2 + 10;
        ctx.lineTo(rightElbowX, rightElbowY);
        ctx.lineTo(p.rightHand.x, p.rightHand.y);
        ctx.stroke();
        ctx.restore();

        // 2. Draw Hand Grip Dots
        ctx.save();
        ctx.shadowBlur = 15;
        // Left hand (cyan)
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.beginPath();
        ctx.arc(p.leftHand.x, p.leftHand.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Right hand (pink)
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.beginPath();
        ctx.arc(p.rightHand.x, p.rightHand.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Draw Pendulum Legs (swinging beneath torso)
        ctx.save();
        ctx.fillStyle = '#ff007f';
        ctx.translate(p.x + p.width/2, p.y + p.height - 10);
        ctx.rotate(p.legAngle);

        // Left Leg
        ctx.fillRect(-18, 0, 10, 25);
        ctx.fillRect(-18 + Math.sin(p.legAngle)*5, 25, 10, 15); // foot block

        // Right Leg
        ctx.fillRect(8, 0, 10, 25);
        ctx.fillRect(8 + Math.sin(p.legAngle)*5, 25, 10, 15); // foot block
        ctx.restore();

        // 4. Draw Torso Core
        ctx.save();
        ctx.fillStyle = '#0a071b';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f0ff';

        // Draw body block
        ctx.fillRect(p.x, p.y + 12, p.width, p.height - 22);
        ctx.strokeRect(p.x, p.y + 12, p.width, p.height - 22);

        // Head block
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(p.x + p.width/2 - 10, p.y - 12, 20, 20);
        
        // Inner chest grid detail
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 8, p.y + 20, p.width - 16, p.height - 38);
        
        ctx.restore();
    }
}
