class PoseDetector {
    constructor() {
        this.video = null;
        this.pose = null;
        this.camera = null;
        this.listeners = new Set();
        this.initialized = false;
        this.loading = false;
        this.lastResults = null;

        // Calibration Baselines
        this.baselines = {
            standingHeadY: null,
            standingHipY: null,
            squatThresholdY: 0.1,  // Difference from standing (increased Y is down)
            jumpThresholdY: 0.08,   // Difference from standing (decreased Y is up)
            maxReachY: 0.15,
            leanLeftThreshold: 0,
            leanRightThreshold: 0,
            calibrated: false
        };

        // User Custom Settings
        this.settings = {
            jumpSensitivity: 1.0,
            squatSensitivity: 1.0,
            seatedMode: false
        };

        // Current user posture states
        this.posture = {
            isFullyVisible: false,
            isSquatting: false,
            isJumping: false,
            hipY: 0,
            headY: 0,
            tooFarLeft: false,
            tooFarRight: false,
            tooClose: false,
            tooFar: false,
            armsFront: false,
            armsSide: false,
            leftArmSide: false,
            rightArmSide: false,
            armsUp: false,
            armsDown: false,
            isLeaningLeft: false,
            isLeaningRight: false,
            isPunchingLeft: false,
            isPunchingRight: false,
            isArmsOverhead: false,
            isPushingFront: false
        };
        this.lowBrightness = false;
    }

    async init() {
        if (this.initialized || this.loading) return;
        this.loading = true;
        console.log("Initializing MediaPipe Pose...");

        // Create hidden video element if not exists
        if (!this.video) {
            this.video = document.createElement('video');
            this.video.setAttribute('autoplay', '');
            this.video.setAttribute('muted', '');
            this.video.setAttribute('playsinline', '');
            this.video.style.position = 'fixed';
            this.video.style.top = '-9999px';
            this.video.style.left = '-9999px';
            this.video.style.width = '640px';
            this.video.style.height = '480px';
            document.body.appendChild(this.video);
        }

        try {
            this.pose = new Pose({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
            });

            this.pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.6,
                minTrackingConfidence: 0.6
            });

            this.pose.onResults((results) => this.handleResults(results));

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: "user" },
                audio: false
            });
            this.video.srcObject = stream;
            
            // Assign to UI video tags for native playback
            const v1 = document.getElementById('home-video'); if (v1) v1.srcObject = stream;
            const v2 = document.getElementById('calibration-video'); if (v2) v2.srcObject = stream;
            const v3 = document.getElementById('game-video'); if (v3) v3.srcObject = stream;

            await this.video.play();

            // Hidden canvas for brightness sampling
            this.brightnessCanvas = document.createElement('canvas');
            this.brightnessCanvas.width = 64;
            this.brightnessCanvas.height = 48;
            this.brightnessCtx = this.brightnessCanvas.getContext('2d', { willReadFrequently: true });

            this.camera = new Camera(this.video, {
                onFrame: async () => {
                    if (this.video && !this.video.paused) {
                        await this.pose.send({ image: this.video });
                        this.checkEnvironmentBrightness();
                    }
                },
                width: 640,
                height: 480
            });
            await this.camera.start();

            this.initialized = true;
            this.loading = false;
            console.log("MediaPipe Pose & Camera fully initialized.");
            document.getElementById('system-status-text').innerText = "SYSTEM ACTIVE";
            document.getElementById('system-status-text').style.color = "var(--success-green)";
            document.getElementById('system-status-dot').style.backgroundColor = "var(--success-green)";
            document.getElementById('system-status-dot').style.boxShadow = "0 0 8px var(--success-green)";
        } catch (err) {
            this.loading = false;
            console.error("Failed to initialize MediaPipe / Camera:", err);
            const statusText = document.getElementById('system-status-text');
            const statusDot = document.getElementById('system-status-dot');
            if (statusText) { statusText.innerText = "CAMERA ERROR — ALLOW WEBCAM"; statusText.style.color = "#ff5b5b"; }
            if (statusDot) {
                statusDot.style.backgroundColor = "red";
                statusDot.style.boxShadow = "0 0 8px red";
            }
            // Non-blocking notice (a blocking alert() freezes the whole app / preview).
            const loading = document.getElementById('home-camera-loading');
            if (loading) {
                loading.innerHTML = '<p style="font-family: var(--font-pixel); font-size: 0.6rem; color: #ff5b5b; text-align: center; padding: 1rem; line-height: 1.6;">CAMERA UNAVAILABLE<br>Allow webcam permissions,<br>then refresh.</p>';
                loading.style.opacity = '1';
                loading.style.display = 'flex';
            }
        }
    }

    addListener(callback) {
        this.listeners.add(callback);
        // NOTE: init() is intentionally NOT called here. The camera starts only via an
        // explicit user gesture (AppController.startExperience) so the browser reliably
        // shows the permission prompt. Subscribing early is harmless — listeners just
        // begin receiving frames once the camera is enabled.
    }

    removeListener(callback) {
        this.listeners.delete(callback);
    }

    checkEnvironmentBrightness() {
        if (!this.video || !this.brightnessCtx) return;
        try {
            this.brightnessCtx.drawImage(this.video, 0, 0, 64, 48);
            const frame = this.brightnessCtx.getImageData(0, 0, 64, 48);
            let sum = 0;
            const data = frame.data;
            for (let i = 0; i < data.length; i += 4) {
                sum += (data[i] + data[i+1] + data[i+2]) / 3;
            }
            const avgBrightness = sum / (data.length / 4);
            // Threshold for low brightness (0-255 scale)
            this.lowBrightness = avgBrightness < 45;
        } catch(e) {
            // ignore errors
        }
    }

    handleResults(results) {
        this.lastResults = results;
        
        if (results.poseLandmarks) {
            this.processPosture(results.poseLandmarks);
        } else {
            this.posture.isFullyVisible = false;
        }

        for (const listener of this.listeners) {
            try {
                listener(results, this.posture);
            } catch (e) {
                console.error("Error in PoseDetector listener:", e);
            }
        }
    }

    calculateAngle(a, b, c) {
        if (!a || !b || !c || a.visibility < 0.5 || b.visibility < 0.5 || c.visibility < 0.5) return 0;
        let radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
    }

    processPosture(landmarks) {
        // Essential landmarks indexes:
        // 0: Nose (Head)
        // 11, 12: Shoulders
        // 13, 14: Elbows
        // 15, 16: Wrists
        // 23, 24: Hips
        // 25, 26: Knees
        // 27, 28: Ankles
        const nose = landmarks[0];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const leftAnkle = landmarks[27];
        const rightAnkle = landmarks[28];

        // Check if head, hips, and lower legs are visible (visibility index > 0.5)
        const headVisible = nose && nose.visibility > 0.5;
        const hipsVisible = leftHip && rightHip && leftHip.visibility > 0.5 && rightHip.visibility > 0.5;
        const feetVisible = leftAnkle && rightAnkle && leftAnkle.visibility > 0.5 && rightAnkle.visibility > 0.5;

        if (this.settings.seatedMode) {
            // Bypass lower-body requirements
            this.posture.isFullyVisible = headVisible; 
        } else {
            this.posture.isFullyVisible = headVisible && hipsVisible && feetVisible;
        }

        if (hipsVisible && headVisible) {
            const hipY = (leftHip.y + rightHip.y) / 2;
            const headY = nose.y;

            this.posture.hipY = hipY;
            this.posture.headY = headY;

            // Frame Position Analysis
            this.posture.tooFarLeft = nose.x < 0.25;
            this.posture.tooFarRight = nose.x > 0.75;
            
            // Assuming ankles are somewhat visible to gauge full height
            if (feetVisible) {
                const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
                const boundingHeight = avgAnkleY - nose.y;
                this.posture.tooClose = boundingHeight > 0.8;
                this.posture.tooFar = boundingHeight < 0.4;
            } else {
                this.posture.tooClose = false;
                this.posture.tooFar = false;
            }

            // Arm Poses (Arm angles relative to shoulders and hips)
            const leftShoulderAngle = this.calculateAngle(leftHip, leftShoulder, leftElbow);
            const rightShoulderAngle = this.calculateAngle(rightHip, rightShoulder, rightElbow);
            const leftElbowAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist);
            const rightElbowAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist);

            // Is arms straight down (shoulder angle < 30)
            this.posture.armsDown = (leftShoulderAngle < 35 && rightShoulderAngle < 35);
            
            // Is arms raised to side (shoulder angle 70-110, elbow straight)
            this.posture.leftArmSide = (leftShoulderAngle > 60 && leftShoulderAngle < 120 && leftElbowAngle > 140);
            this.posture.rightArmSide = (rightShoulderAngle > 60 && rightShoulderAngle < 120 && rightElbowAngle > 140);
            this.posture.armsSide = this.posture.leftArmSide && this.posture.rightArmSide;
            
            // Is arms straight up (overhead)
            this.posture.armsUp = (leftShoulderAngle > 140 && rightShoulderAngle > 140 &&
                                   leftElbowAngle > 140 && rightElbowAngle > 140);
            this.posture.isArmsOverhead = this.posture.armsUp;
            
            // Is arms in front (Pushing motion)
            const wristDist = Math.abs(leftWrist.x - rightWrist.x);
            const wristHeightFromShoulder = Math.abs((leftWrist.y + rightWrist.y) / 2 - (leftShoulder.y + rightShoulder.y) / 2);
            this.posture.armsFront = (leftShoulderAngle > 70 && leftShoulderAngle < 110 && 
                                      rightShoulderAngle > 70 && rightShoulderAngle < 110 &&
                                      wristDist < 0.3 && wristHeightFromShoulder < 0.15);
            this.posture.isPushingFront = this.posture.armsFront;

            // Punches (Wrist extended far from shoulder laterally or forward)
            // Normalized against shoulder width so it works at any distance from the camera
            const shoulderWidth = Math.max(0.1, Math.abs(leftShoulder.x - rightShoulder.x));
            
            // X is lateral extension. Z is depth (negative Z is closer to the camera).
            const leftXExt = Math.abs(leftWrist.x - leftShoulder.x);
            const leftZExt = leftShoulder.z - leftWrist.z; 
            
            const rightXExt = Math.abs(rightWrist.x - rightShoulder.x);
            const rightZExt = rightShoulder.z - rightWrist.z;
            
            // Trigger if arm is extended forward (jab) OR sideways (hook/lateral)
            this.posture.isPunchingLeft = (leftZExt > shoulderWidth * 1.2) || (leftXExt > shoulderWidth * 1.8);
            this.posture.isPunchingRight = (rightZExt > shoulderWidth * 1.2) || (rightXExt > shoulderWidth * 1.8);

            // Cross Punch (Twisting Torso + Arm Crossover)
            // Right arm punching across to the physical left side
            const rightArmCross = (rightWrist.x > leftShoulder.x) && 
                                  (rightShoulder.z < leftShoulder.z - 0.05) &&
                                  (rightWrist.y < rightHip.y);
            
            // Left arm punching across to the physical right side
            const leftArmCross = (leftWrist.x < rightShoulder.x) && 
                                 (leftShoulder.z < rightShoulder.z - 0.05) &&
                                 (leftWrist.y < leftHip.y);

            this.posture.isCrossPunchingLeft = rightArmCross;
            this.posture.isCrossPunchingRight = leftArmCross;

            // High Knees (Knee raised significantly above standing ankle, close to hip)
            if (feetVisible && leftKnee && rightKnee) {
                const leftLegLength = Math.abs(leftAnkle.y - leftHip.y);
                const rightLegLength = Math.abs(rightAnkle.y - rightHip.y);
                
                // If knee is within top 35% of the leg (close to hip)
                this.posture.isHighKneeLeft = leftKnee.y < leftHip.y + (leftLegLength * 0.35);
                this.posture.isHighKneeRight = rightKnee.y < rightHip.y + (rightLegLength * 0.35);

                // Kicks (One ankle raised significantly higher than the standing ankle)
                // If left ankle is higher than right ankle by 40% of the standing leg's length
                this.posture.isKickingLeft = leftAnkle.y < rightAnkle.y - (rightLegLength * 0.40);
                this.posture.isKickingRight = rightAnkle.y < leftAnkle.y - (leftLegLength * 0.40);
            } else {
                this.posture.isHighKneeLeft = false;
                this.posture.isHighKneeRight = false;
                this.posture.isKickingLeft = false;
                this.posture.isKickingRight = false;
            }

            // Guard / Shield Block (Wrists brought close to the face/nose)
            if (headVisible && leftWrist && rightWrist) {
                const distLeft = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y);
                const distRight = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y);
                const guardThresh = shoulderWidth * 0.8; 
                
                this.posture.isGuarding = (distLeft < guardThresh && distRight < guardThresh);
            } else {
                this.posture.isGuarding = false;
            }

            // Wide Stance / Sumo
            if (feetVisible) {
                this.posture.isWideStance = Math.abs(leftAnkle.x - rightAnkle.x) > shoulderWidth * 2.5;
            } else {
                this.posture.isWideStance = false;
            }

            // Bicep Curls and Uppercuts
            if (headVisible && leftElbow && rightElbow) {
                // Curl: Elbow down, wrist up but below shoulder, wrist aligned with shoulder X
                this.posture.isCurlingLeft = (leftElbow.y > leftShoulder.y) && 
                                             (leftWrist.y < leftElbow.y - 0.05) && 
                                             (leftWrist.y > leftShoulder.y) &&
                                             (Math.abs(leftWrist.x - leftShoulder.x) < 0.15) &&
                                             !this.posture.isGuarding;
                                             
                this.posture.isCurlingRight = (rightElbow.y > rightShoulder.y) && 
                                              (rightWrist.y < rightElbow.y - 0.05) && 
                                              (rightWrist.y > rightShoulder.y) &&
                                              (Math.abs(rightWrist.x - rightShoulder.x) < 0.15) &&
                                              !this.posture.isGuarding;

                // Uppercut: wrist driven vertically above shoulder, but elbow is bent
                this.posture.isUppercutLeft = (leftWrist.y < leftShoulder.y) && 
                                              (leftElbow.y > leftShoulder.y) && 
                                              (leftWrist.z < leftShoulder.z - 0.05) && 
                                              !this.posture.isGuarding;
                                              
                this.posture.isUppercutRight = (rightWrist.y < rightShoulder.y) && 
                                               (rightElbow.y > rightShoulder.y) && 
                                               (rightWrist.z < rightShoulder.z - 0.05) &&
                                               !this.posture.isGuarding;
            } else {
                this.posture.isCurlingLeft = false;
                this.posture.isCurlingRight = false;
                this.posture.isUppercutLeft = false;
                this.posture.isUppercutRight = false;
            }

            // Leans (Torso angle)
            const shoulderCX = (leftShoulder.x + rightShoulder.x) / 2;
            const hipCX = (leftHip.x + rightHip.x) / 2;
            const leanX = hipCX - shoulderCX; // Mirrored coordinate offset
            
            this.posture.isLeaningLeft = leanX < -0.08; // Threshold
            this.posture.isLeaningRight = leanX > 0.08;

            // If baselines are calibrated, detect movement triggers
            if (this.baselines.calibrated) {
                // SQUAT DETECTION
                const effectiveSquatThresh = this.baselines.squatThresholdY / this.settings.squatSensitivity;
                const squatLimit = this.baselines.standingHipY + effectiveSquatThresh;
                this.posture.isSquatting = hipY > squatLimit;

                // JUMP DETECTION
                const effectiveJumpThresh = this.baselines.jumpThresholdY / this.settings.jumpSensitivity;
                const jumpLimit = this.baselines.standingHeadY - effectiveJumpThresh;
                this.posture.isJumping = headY < jumpLimit;
            } else {
                // Fallback uncalibrated thresholds
                this.posture.isSquatting = hipY > (0.72 - (this.settings.squatSensitivity - 1.0) * 0.1); 
                this.posture.isJumping = headY < (0.28 + (this.settings.jumpSensitivity - 1.0) * 0.1);   
            }
        }
    }

    calibrateStanding() {
        if (!this.lastResults || !this.lastResults.poseLandmarks) return false;
        
        const landmarks = this.lastResults.poseLandmarks;
        const nose = landmarks[0];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        
        if (nose && leftHip && rightHip) {
            this.baselines.standingHeadY = nose.y;
            this.baselines.standingHipY = (leftHip.y + rightHip.y) / 2;
            return true;
        }
        return false;
    }

    calibrateSquatThreshold() {
        if (!this.lastResults || !this.lastResults.poseLandmarks) return false;
        
        const landmarks = this.lastResults.poseLandmarks;
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        
        if (leftHip && rightHip && this.baselines.standingHipY !== null) {
            const squatHipY = (leftHip.y + rightHip.y) / 2;
            // Squat depth threshold is 65% of the distance squatted down
            const diff = squatHipY - this.baselines.standingHipY;
            if (diff > 0.05) { // Ensure they actually squatted down a bit
                this.baselines.squatThresholdY = diff * 0.65;
                return true;
            }
        }
        return false;
    }

    calibrateJumpThreshold() {
        if (!this.lastResults || !this.lastResults.poseLandmarks) return false;
        
        const landmarks = this.lastResults.poseLandmarks;
        const nose = landmarks[0];
        
        if (nose && this.baselines.standingHeadY !== null) {
            const jumpHeadY = nose.y;
            // Jump threshold is 65% of their vertical leap displacement
            const diff = this.baselines.standingHeadY - jumpHeadY;
            if (diff > 0.03) { // Ensure they actually hopped up a bit
                this.baselines.jumpThresholdY = diff * 0.65;
                return true;
            }
        }
        return false;
    }

    calibrateLeanLeft() {
        if (!this.lastResults || !this.lastResults.poseLandmarks) return false;
        const landmarks = this.lastResults.poseLandmarks;
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        
        if (leftShoulder && rightShoulder && leftHip && rightHip) {
            const shoulderCX = (leftShoulder.x + rightShoulder.x) / 2;
            const hipCX = (leftHip.x + rightHip.x) / 2;
            const leanX = hipCX - shoulderCX; // Mirrored coordinate offset
            
            this.baselines.leanLeftThreshold = Math.min(this.baselines.leanLeftThreshold, leanX);
            return true;
        }
        return false;
    }

    calibrateLeanRight() {
        if (!this.lastResults || !this.lastResults.poseLandmarks) return false;
        const landmarks = this.lastResults.poseLandmarks;
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        
        if (leftShoulder && rightShoulder && leftHip && rightHip) {
            const shoulderCX = (leftShoulder.x + rightShoulder.x) / 2;
            const hipCX = (leftHip.x + rightHip.x) / 2;
            const leanX = hipCX - shoulderCX; // Mirrored coordinate offset
            
            this.baselines.leanRightThreshold = Math.max(this.baselines.leanRightThreshold, leanX);
            return true;
        }
        return false;
    }

    finalizeCalibration() {
        if (this.baselines.standingHeadY !== null && this.baselines.standingHipY !== null) {
            this.baselines.calibrated = true;
            console.log("Calibration Finalized:", this.baselines);
            return true;
        }
        return false;
    }

    // Helper: Draw Glowing Skeleton and webcam feed to a target canvas
    draw(canvas, drawWebcam = true) {
        if (!this.video || !this.initialized) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // 1. Draw reflected Video feed
        if (drawWebcam && this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            ctx.save();
            ctx.translate(width, 0);
            ctx.scale(-1, 1); // mirror
            ctx.drawImage(this.video, 0, 0, width, height);
            ctx.restore();
        }

        // 2. Draw Skeleton overlays
        if (this.lastResults && this.lastResults.poseLandmarks) {
            const landmarks = this.lastResults.poseLandmarks;

            // Colors
            const colorCyan = "#00f0ff";
            const colorPink = "#ff007f";
            const colorGreen = "#39ff14";

            // Define connections to draw
            const connections = [
                [11, 12], // shoulder-to-shoulder
                [11, 13], [13, 15], // left arm
                [12, 14], [14, 16], // right arm
                [11, 23], [12, 24], // shoulders to hips
                [23, 24], // hip-to-hip
                [23, 25], [25, 27], // left leg
                [24, 26], [26, 28]  // right leg
            ];

            // Helper to get canvas coordinates
            const getCoords = (pt) => ({
                x: (1 - pt.x) * width, // flip X to match mirrored feed
                y: pt.y * height
            });

            // Draw Connection Bones (Neon Pink Glow)
            ctx.shadowBlur = 10;
            ctx.shadowColor = colorPink;
            ctx.lineWidth = 4;
            ctx.strokeStyle = colorPink;

            connections.forEach(([i, j]) => {
                const ptA = landmarks[i];
                const ptB = landmarks[j];
                if (ptA && ptB && ptA.visibility > 0.5 && ptB.visibility > 0.5) {
                    const cA = getCoords(ptA);
                    const cB = getCoords(ptB);
                    ctx.beginPath();
                    ctx.moveTo(cA.x, cA.y);
                    ctx.lineTo(cB.x, cB.y);
                    ctx.stroke();
                }
            });

            // Draw Head / Face dot
            const nose = landmarks[0];
            if (nose && nose.visibility > 0.5) {
                const cNose = getCoords(nose);
                ctx.shadowColor = colorCyan;
                ctx.fillStyle = colorCyan;
                ctx.beginPath();
                ctx.arc(cNose.x, cNose.y, 8, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw Joint Dots (Neon Cyan / Green if active movement)
            ctx.shadowColor = colorCyan;
            ctx.fillStyle = colorCyan;
            ctx.shadowBlur = 15;

            const joints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
            joints.forEach(idx => {
                const pt = landmarks[idx];
                if (pt && pt.visibility > 0.5) {
                    const coords = getCoords(pt);
                    
                    // Highlight hips/ankles green if squatting/jumping
                    if ((idx === 23 || idx === 24) && this.posture.isSquatting) {
                        ctx.fillStyle = colorGreen;
                        ctx.shadowColor = colorGreen;
                    } else if ((idx === 11 || idx === 12) && this.posture.isJumping) {
                        ctx.fillStyle = colorGreen;
                        ctx.shadowColor = colorGreen;
                    } else {
                        ctx.fillStyle = colorCyan;
                        ctx.shadowColor = colorCyan;
                    }

                    ctx.beginPath();
                    ctx.arc(coords.x, coords.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            // Reset shadows
            ctx.shadowBlur = 0;
            
            // Draw horizontal threshold guides in Calibration Mode
            if (!this.baselines.calibrated && this.baselines.standingHipY !== null) {
                // Draw standing baseline hip level
                ctx.lineWidth = 1;
                ctx.strokeStyle = "rgba(255, 234, 0, 0.5)"; // yellow
                ctx.beginPath();
                ctx.moveTo(0, this.baselines.standingHipY * height);
                ctx.lineTo(width, this.baselines.standingHipY * height);
                ctx.stroke();

                // Draw Squat target level
                const targetSquatY = (this.baselines.standingHipY + this.baselines.squatThresholdY) * height;
                ctx.strokeStyle = "rgba(57, 255, 20, 0.7)"; // success green
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(0, targetSquatY);
                ctx.lineTo(width, targetSquatY);
                ctx.stroke();
                ctx.setLineDash([]);
                
                ctx.fillStyle = "rgba(57, 255, 20, 0.8)";
                ctx.font = "10px monospace";
                ctx.fillText("SQUAT TARGET LINE", 10, targetSquatY - 5);
            }
        }
    }
}

// Global instance
const poseDetector = new PoseDetector();
