class AppController {
    constructor() {
        this.currentScreen = 'screen-home';
        this.activeGame = null;
        
        // Calibration Wizard State
        this.calibrationTargetGame = null;
        this.calibrationSequence = [];
        this.calibrationStepIndex = 0;
        this.calibrationState = 'IDLE'; // IDLE, VISIBLE_COUNTDOWN, VISIBLE_CAPTURE, SQUAT_COUNTDOWN, SQUAT_CAPTURE, JUMP_COUNTDOWN, JUMP_CAPTURE, COMPLETE
        this.calibrationCounter = 0;
        this.calibrationInterval = null;
        this.maxSquatHipY = 0;
        this.peakJumpHeadY = 1.0;
        this.pendingQuickGame = null;

        // Regime state
        this.currentRegime = null;
        this.regimeStage = 0;

        // Element references
        this.screens = {};
        this.btnSound = null;
    }

    init() {
        // Cache screens
        ['home', 'calibration', 'game', 'summary'].forEach(name => {
            this.screens[name] = document.getElementById(`screen-${name}`);
        });

        this.btnSound = document.getElementById('btn-sound-toggle');
        this.setupEventListeners();
        
        // The camera is requested only on an EXPLICIT user gesture (the welcome overlay).
        // Browsers suppress getUserMedia prompts that aren't user-initiated, which is why
        // an auto-request on load silently failed to ask. If the user already granted the
        // camera on a previous visit, skip the gate and start straight away.
        this._poseCb = (results, posture) => this.onGlobalPoseDetected(results, posture);
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'camera' })
                .then(p => { if (p.state === 'granted') this.startExperience(); })
                .catch(() => {});
        }

        // Restore saved calibration so users don't have to recalibrate every session.
        if (typeof Store !== 'undefined') {
            const savedCal = Store.loadCalibration();
            if (savedCal) {
                Object.assign(poseDetector.baselines, savedCal);
                poseDetector.baselines.calibrated = true;
                console.log("Restored saved calibration.");
            }
        }

        console.log("Workout Games App Controller Initialized.");
    }

    // Called by the welcome overlay's button (a real user gesture) — or automatically
    // when the camera was already granted. This is what reliably triggers the prompt.
    startExperience() {
        const btn = document.getElementById('btn-welcome-start');
        const status = document.getElementById('welcome-status');
        const stext = document.getElementById('system-status-text');
        if (typeof audio !== 'undefined') audio.init(); // unlock Web Audio on the same gesture
        if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
        if (status) status.innerText = 'REQUESTING CAMERA…';

        // Add the pose listener once (that triggers init); retries re-init directly.
        if (!this._camWired) { this._camWired = true; poseDetector.addListener(this._poseCb); }
        poseDetector.init(); // explicit, gesture-initiated camera start (guarded; safe to re-call)

        let waited = 0;
        if (this._camPoll) clearInterval(this._camPoll);
        this._camPoll = setInterval(() => {
            waited += 300;
            if (poseDetector.initialized) {
                clearInterval(this._camPoll);
                this._finishWelcome();
            } else if (stext && /ERROR|UNAVAILABLE/i.test(stext.innerText)) {
                clearInterval(this._camPoll);
                if (status) status.innerHTML = '<span style="color:#ff5b5b;">Camera blocked. Allow it in your browser, then retry.</span>';
                if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerText = '↻ RETRY CAMERA'; }
            } else if (waited > 20000) {
                clearInterval(this._camPoll);
                if (status) status.innerText = 'Still waiting — check the camera permission and retry.';
                if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerText = '↻ RETRY'; }
            }
        }, 300);
    }

    _finishWelcome() {
        const ov = document.getElementById('welcome-overlay');
        if (ov) ov.classList.remove('active');
        // New user -> guided calibration; returning (already calibrated) -> straight to home.
        if (poseDetector.baselines && poseDetector.baselines.calibrated) this.goToHome();
        else this.goToCalibration();
    }

    setupEventListeners() {
        // Sound toggle button
        if (this.btnSound) {
            this.btnSound.addEventListener('click', () => {
                audio.init();
                const currentMuted = audio.muted;
                audio.setMuted(!currentMuted);
                this.btnSound.innerText = `Sound: ${!currentMuted ? 'OFF' : 'ON'}`;
                this.btnSound.classList.toggle('pink', !currentMuted);
                audio.playClick();
            });
        }

        // Settings Modal
        const btnSettingsOpen = document.getElementById('btn-settings-open');
        const btnSettingsClose = document.getElementById('btn-settings-close');
        const settingsModal = document.getElementById('settings-modal');

        if (btnSettingsOpen && settingsModal) {
            btnSettingsOpen.addEventListener('click', () => {
                settingsModal.classList.add('active');
                audio.playClick();
            });
        }
        if (btnSettingsClose && settingsModal) {
            btnSettingsClose.addEventListener('click', () => {
                settingsModal.classList.remove('active');
                audio.playClick();
            });
        }

        // Settings Controls
        const sliderMasterVol = document.getElementById('slider-master-vol');
        if (sliderMasterVol) sliderMasterVol.addEventListener('input', (e) => audio.setMasterVolume(parseFloat(e.target.value)));
        
        const sliderSfxVol = document.getElementById('slider-sfx-vol');
        if (sliderSfxVol) sliderSfxVol.addEventListener('input', (e) => audio.setSfxVolume(parseFloat(e.target.value)));

        const sliderJumpSens = document.getElementById('slider-jump-sens');
        if (sliderJumpSens) sliderJumpSens.addEventListener('input', (e) => poseDetector.settings.jumpSensitivity = parseFloat(e.target.value));

        const sliderSquatSens = document.getElementById('slider-squat-sens');
        if (sliderSquatSens) sliderSquatSens.addEventListener('input', (e) => poseDetector.settings.squatSensitivity = parseFloat(e.target.value));

        const toggleSeated = document.getElementById('toggle-seated-mode');
        if (toggleSeated) toggleSeated.addEventListener('change', (e) => poseDetector.settings.seatedMode = e.target.checked);

        // Setup manual keyboard controls (Space = Jump, ArrowDown = Squat) for developer accessibility and fallback play
        window.addEventListener('keydown', (e) => {
            if (this.activeGame instanceof RunnerGame) {
                if (e.code === 'Space' || e.code === 'ArrowUp') {
                    e.preventDefault();
                    this.activeGame.triggerManualJump();
                }
                if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    this.activeGame.triggerManualDuck(true);
                }
            } else if (this.activeGame instanceof ClimbGame) {
                if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyI') {
                    e.preventDefault();
                    this.activeGame.triggerManualJump();
                }
                if (e.code === 'KeyA') {
                    e.preventDefault();
                    this.activeGame.steerLeft();
                }
                if (e.code === 'KeyD') {
                    e.preventDefault();
                    this.activeGame.steerRight();
                }
            } else if (typeof SpaceShieldGame !== 'undefined' && this.activeGame instanceof SpaceShieldGame) {
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
                    e.preventDefault();
                    this.activeGame.ship.vx = -this.activeGame.ship.speed;
                }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') {
                    e.preventDefault();
                    this.activeGame.ship.vx = this.activeGame.ship.speed;
                }
                if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'KeyI') {
                    e.preventDefault();
                    this.activeGame.fireLaser();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (this.activeGame instanceof RunnerGame) {
                if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    this.activeGame.triggerManualDuck(false);
                }
            } else if (this.activeGame instanceof ClimbGame) {
                if (e.code === 'KeyA' || e.code === 'KeyD') {
                    e.preventDefault();
                    this.activeGame.steerCenter();
                }
            } else if (typeof SpaceShieldGame !== 'undefined' && this.activeGame instanceof SpaceShieldGame) {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
                    e.preventDefault();
                    this.activeGame.ship.vx = 0;
                }
            }
        });
    }

    showScreen(screenId) {
        Object.values(this.screens).forEach(screen => {
            if (screen) screen.classList.remove('active');
        });
        
        const target = this.screens[screenId];
        if (target) {
            target.classList.add('active');
            this.currentScreen = `screen-${screenId}`;
        }
        audio.playClick();
    }

    goToHome() {
        this.currentRegime = null;
        this.pendingQuickGame = null;
        this.pendingCircuit = false; // cancel a queued circuit if the user exits calibration
        this.showScreen('home');
    }

    isCalibratedFor(gameType) {
        const b = poseDetector.baselines;
        if (gameType === 'runner') {
            return b.standingHeadY !== null && b.standingHipY !== null && b.squatThresholdY > 0 && b.jumpThresholdY > 0;
        } else if (gameType === 'climb') {
            return b.standingHeadY !== null && b.standingHipY !== null && b.maxReachY > 0 && b.leanLeftThreshold < 0 && b.leanRightThreshold > 0;
        } else if (gameType === 'shield') {
            return b.standingHeadY !== null && b.standingHipY !== null;
        }
        return b.calibrated;
    }

    goToCalibration(gameType = null) {
        this.calibrationTargetGame = gameType;
        this.calibrationState = 'IDLE';
        this.calibrationCounter = 0;
        if (this.calibrationInterval) clearInterval(this.calibrationInterval);
        
        if (this.calibrationTargetGame === 'runner') {
            this.calibrationSequence = ['VISIBLE_COUNTDOWN', 'SQUAT_TEST', 'JUMP_TEST'];
        } else if (this.calibrationTargetGame === 'climb') {
            this.calibrationSequence = ['VISIBLE_COUNTDOWN', 'ARMS_OVERHEAD_TEST', 'LEAN_LEFT_TEST', 'LEAN_RIGHT_TEST'];
        } else {
            // Only the moves the games actually use — keeps calibration short and
            // every calibrated pose meaningful. (Detection for the extra poses
            // remains in pose-detector.js for future gameplay.)
            this.calibrationSequence = [
                'VISIBLE_COUNTDOWN',
                'SQUAT_TEST',
                'JUMP_TEST',
                'LEAN_LEFT_TEST',
                'LEAN_RIGHT_TEST',
                'PUNCH_LEFT_TEST',
                'PUNCH_RIGHT_TEST',
                'ARMS_OVERHEAD_TEST',
                'PUSHUP_TEST'
            ];
        }

        const s = this.calibrationSequence;
        const eVisible = document.getElementById('cal-step-visible');
        const eSquat = document.getElementById('cal-step-squat');
        const eJump = document.getElementById('cal-step-jump');
        const eHighKneeLeft = document.getElementById('cal-step-highknee-left');
        const eHighKneeRight = document.getElementById('cal-step-highknee-right');
        const eKickLeft = document.getElementById('cal-step-kick-left');
        const eKickRight = document.getElementById('cal-step-kick-right');
        const eLeanLeft = document.getElementById('cal-step-lean-left');
        const eLeanRight = document.getElementById('cal-step-lean-right');
        const ePunchLeft = document.getElementById('cal-step-punch-left');
        const ePunchRight = document.getElementById('cal-step-punch-right');
        const eCrossPunchLeft = document.getElementById('cal-step-crosspunch-left');
        const eCrossPunchRight = document.getElementById('cal-step-crosspunch-right');
        const eGuard = document.getElementById('cal-step-guard');
        const eUppercutLeft = document.getElementById('cal-step-uppercut-left');
        const eUppercutRight = document.getElementById('cal-step-uppercut-right');
        const eCurlLeft = document.getElementById('cal-step-curl-left');
        const eCurlRight = document.getElementById('cal-step-curl-right');
        const eWideStance = document.getElementById('cal-step-widestance');
        const eArmsOverhead = document.getElementById('cal-step-arms-overhead');
        const ePushup = document.getElementById('cal-step-pushup');
        
        if (eVisible) eVisible.style.display = s.includes('VISIBLE_COUNTDOWN') ? 'flex' : 'none';
        if (eSquat) eSquat.style.display = s.includes('SQUAT_TEST') ? 'flex' : 'none';
        if (eJump) eJump.style.display = s.includes('JUMP_TEST') ? 'flex' : 'none';
        if (eHighKneeLeft) eHighKneeLeft.style.display = s.includes('HIGHKNEE_LEFT_TEST') ? 'flex' : 'none';
        if (eHighKneeRight) eHighKneeRight.style.display = s.includes('HIGHKNEE_RIGHT_TEST') ? 'flex' : 'none';
        if (eKickLeft) eKickLeft.style.display = s.includes('KICK_LEFT_TEST') ? 'flex' : 'none';
        if (eKickRight) eKickRight.style.display = s.includes('KICK_RIGHT_TEST') ? 'flex' : 'none';
        if (eLeanLeft) eLeanLeft.style.display = s.includes('LEAN_LEFT_TEST') ? 'flex' : 'none';
        if (eLeanRight) eLeanRight.style.display = s.includes('LEAN_RIGHT_TEST') ? 'flex' : 'none';
        if (ePunchLeft) ePunchLeft.style.display = s.includes('PUNCH_LEFT_TEST') ? 'flex' : 'none';
        if (ePunchRight) ePunchRight.style.display = s.includes('PUNCH_RIGHT_TEST') ? 'flex' : 'none';
        if (eCrossPunchLeft) eCrossPunchLeft.style.display = s.includes('CROSSPUNCH_LEFT_TEST') ? 'flex' : 'none';
        if (eCrossPunchRight) eCrossPunchRight.style.display = s.includes('CROSSPUNCH_RIGHT_TEST') ? 'flex' : 'none';
        if (eGuard) eGuard.style.display = s.includes('GUARD_TEST') ? 'flex' : 'none';
        if (eUppercutLeft) eUppercutLeft.style.display = s.includes('UPPERCUT_LEFT_TEST') ? 'flex' : 'none';
        if (eUppercutRight) eUppercutRight.style.display = s.includes('UPPERCUT_RIGHT_TEST') ? 'flex' : 'none';
        if (eCurlLeft) eCurlLeft.style.display = s.includes('CURL_LEFT_TEST') ? 'flex' : 'none';
        if (eCurlRight) eCurlRight.style.display = s.includes('CURL_RIGHT_TEST') ? 'flex' : 'none';
        if (eWideStance) eWideStance.style.display = s.includes('WIDESTANCE_TEST') ? 'flex' : 'none';
        if (eArmsOverhead) eArmsOverhead.style.display = s.includes('ARMS_OVERHEAD_TEST') ? 'flex' : 'none';
        if (ePushup) ePushup.style.display = s.includes('PUSHUP_TEST') ? 'flex' : 'none';

        // Reset checkmarks + the single action button back to START.
        document.querySelectorAll('.cal-guide-item').forEach(el => el.classList.remove('active'));
        this.setCalibrationAction('START CALIBRATION', true, 'yellow');

        this.showScreen('calibration');
        this.updateCalibrationFeedback();
        
        audio.playVoice("Welcome to calibration. Stand still in front of the camera and press start calibration.");
    }

    confirmCalibration() {
        poseDetector.finalizeCalibration();
        // Persist so calibration survives reloads.
        if (typeof Store !== 'undefined') Store.saveCalibration(poseDetector.baselines);
        if (window.Cloud?.user) window.Cloud.saveProfile({ calibration: poseDetector.baselines }); // cloud mirror (opt-in)
        audio.playSuccess();

        // If the user launched the full-body circuit, calibration was step one —
        // now kick off the actual circuit.
        if (this.pendingCircuit) {
            this.pendingCircuit = false;
            if (typeof startCircuit === 'function') { startCircuit(); return; }
        }

        // If they had a pending regime selection, launch the first game of that regime!
        if (this.currentRegime) {
            this.startRegimeGame();
        } else if (this.pendingQuickGame) {
            this.launchQuickGame(this.pendingQuickGame);
            this.pendingQuickGame = null;
        } else {
            // Otherwise, go home
            this.goToHome();
        }
    }

    selectRegime(regimeType) {
        audio.init();
        this.currentRegime = regimeType;
        this.regimeStage = 0;

        let targetGame = regimeType === 'upper' ? 'climb' : 'runner';

        if (!this.isCalibratedFor(targetGame)) {
            alert("Webcam calibration is required for accurate movement tracking for this game! Let's calibrate your posture first.");
            this.goToCalibration(targetGame);
        } else {
            this.startRegimeGame();
        }
    }

    startRegimeGame() {
        this.showScreen('game');
        
        if (this.activeGame) this.activeGame.stop();
        
        // Define regime configurations
        const regimeConfigs = {
            'legs': { mode: 'REPS', targetSets: 3, targetReps: 15, restTime: 10 },
            'upper': { mode: 'REPS', targetSets: 4, targetReps: 15, restTime: 10 },
            'blitz': { mode: 'REPS', targetSets: 5, targetReps: 20, restTime: 15 }
        };
        
        const config = this.currentRegime ? regimeConfigs[this.currentRegime] : { mode: 'TIME' };

        if (this.currentRegime === 'upper') {
            document.getElementById('hud-game-name').innerText = "NEON CLIMBER";
            document.getElementById('game-instructions-text').innerHTML = `
                <p style="margin-bottom: 1rem; color: #fff;">• REACH high to grip handholds.</p>
                <p style="margin-bottom: 1rem; color: #fff;">• PULL arm down to climb up.</p>
                <p style="color: #fff;">• LEAN chest left/right to move to side columns!</p>
            `;
            this.activeGame = new ClimbGame('game-canvas');
            audio.playVoice("Neon Climber! Reach high to grip and pull down to climb. Lean left or right to steer.");
        } else {
            document.getElementById('hud-game-name').innerText = "PIXEL RUNNER";
            document.getElementById('game-instructions-text').innerHTML = `
                <p style="margin-bottom: 1rem; color: #fff;">• JUMP in place to leap over obstacles.</p>
                <p style="color: #fff;">• SQUAT low to slide under traps.</p>
            `;
            this.activeGame = new RunnerGame('game-canvas');
            audio.playVoice("Pixel Runner! Ready to jump and squat.");
        }
        
        this.activeGame.start(config);
    }

    launchQuickGame(gameType) {
        audio.init();
        this.currentRegime = null;
        
        if (this.activeGame) this.activeGame.stop();
        
        if (!this.isCalibratedFor(gameType)) {
            this.pendingQuickGame = gameType;
            alert("Webcam calibration is required for accurate movement tracking for this game! Let's calibrate your posture first.");
            this.goToCalibration(gameType);
            return;
        }

        if (gameType === 'runner') {
            this.showScreen('game');
            document.getElementById('hud-game-name').innerText = "PIXEL RUNNER";
            document.getElementById('game-instructions-text').innerHTML = `
                <p style="margin-bottom: 1rem; color: #fff;">• JUMP in place to leap over obstacles.</p>
                <p style="color: #fff;">• SQUAT low to slide under traps.</p>
            `;
            this.activeGame = new RunnerGame('game-canvas');
            this.activeGame.start({ mode: 'TIME' });
            audio.playVoice("Pixel Runner! Ready to jump and squat.");
        } else if (gameType === 'climb') {
            const levelSelect = document.getElementById('game-level-select');
            const level = levelSelect ? parseInt(levelSelect.value) : 1;
            
            this.showScreen('game');
            document.getElementById('hud-game-name').innerText = "NEON CLIMBER";
            document.getElementById('game-instructions-text').innerHTML = `
                <p style="margin-bottom: 1rem; color: #fff;">• REACH high to grip handholds.</p>
                <p style="margin-bottom: 1rem; color: #fff;">• PULL arm down to climb up.</p>
                <p style="color: #fff;">• LEAN chest left/right to dodge falling blocks.</p>
            `;
            this.activeGame = new ClimbGame('game-canvas', level);
            this.activeGame.start({ mode: 'TIME' });
            if (level === 2) {
                audio.playVoice("Neon Climber Level 2! Lean and reach to grab stones.");
            } else {
                audio.playVoice("Neon Climber! Reach high to grip and pull down to climb. Lean left or right to steer.");
            }
        } else if (gameType === 'shield') {
            this.showScreen('game');
            document.getElementById('hud-game-name').innerText = "SPACE SHIELD";
            document.getElementById('game-instructions-text').innerHTML = `
                <p style="margin-bottom: 1rem; color: #fff;">• STEER: Left arm out = move left, right arm out = move right.</p>
                <p style="color: #fff;">• FIRE: Punch forward to shoot lasers.</p>
            `;
            this.activeGame = new SpaceShieldGame('game-canvas');
            this.activeGame.start({ mode: 'TIME' });
            audio.playVoice("Space Shield! Raise left or right arm to steer. Punch forward to shoot.");
        }
    }

    togglePauseGame() {
        if (!this.activeGame) return;
        const btn = document.getElementById('btn-game-pause');
        if (this.activeGame.state === 'PLAYING') {
            this.activeGame.pause();
            btn.innerText = "RESUME";
            btn.classList.add('yellow');
        } else if (this.activeGame.state === 'PAUSED') {
            this.activeGame.resume();
            btn.innerText = "PAUSE";
            btn.classList.remove('yellow');
        }
    }

    quitGame() {
        if (this.activeGame) {
            this.activeGame.stop();
            this.activeGame = null;
        }
        // Restore pause button state
        const btn = document.getElementById('btn-game-pause');
        if (btn) {
            btn.innerText = "PAUSE";
            btn.classList.remove('yellow');
        }
        this.goToHome();
    }

    showGameSummary(score, reps, timePlayed) {
        if (this.activeGame) {
            this.activeGame.stop();
            this.activeGame = null;
        }
        
        // Populate stats
        document.getElementById('summary-score').innerText = String(score).toLocaleString();
        document.getElementById('summary-reps').innerText = reps;
        
        const mins = Math.floor(timePlayed / 60);
        const secs = timePlayed % 60;
        document.getElementById('summary-time').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        // Est. calories: average ~8 kcal per minute for jumping/squatting arcade games
        const cals = Math.round((timePlayed / 60) * 8.5);
        document.getElementById('summary-calories').innerText = `${cals} kcal`;
        
        // Check if user exceeded score limits
        if (score > 10000) {
            document.getElementById('summary-headline').innerText = "WORKOUT HERO!";
            document.getElementById('summary-headline').style.color = "var(--success-green)";
        } else {
            document.getElementById('summary-headline').innerText = "WORKOUT COMPLETE!";
            document.getElementById('summary-headline').style.color = "var(--accent-yellow)";
        }

        this.showScreen('summary');
    }

    retryRegimeOrGame() {
        if (this.currentRegime) {
            this.startRegimeGame();
        } else {
            this.launchQuickGame('runner');
        }
    }

    // Handles the real-time frame results from MediaPipe
    onGlobalPoseDetected(results, posture) {
        // 1. Update Home Dashboard Preview Canvas
        if (this.currentScreen === 'screen-home') {
            const loadingOverlay = document.getElementById('home-camera-loading');
            if (loadingOverlay && poseDetector.initialized) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.style.display = 'none', 300);
            }

            const canvas = document.getElementById('home-canvas');
            if (canvas && poseDetector.initialized) {
                poseDetector.draw(canvas, false); // draw mirrored webcam feed + skeleton
            }
        }

        // 2. Update Calibration Screen Flow
        if (this.currentScreen === 'screen-calibration') {
            const loadingOverlay = document.getElementById('calibration-loading');
            if (loadingOverlay && poseDetector.initialized) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.style.display = 'none', 300);
            }

            const canvas = document.getElementById('calibration-canvas');
            if (canvas && poseDetector.initialized) {
                poseDetector.draw(canvas, false);
            }

            const visualCanvas = document.getElementById('visual-aid-canvas');
            if (visualCanvas) {
                this.drawVisualAidSkeleton(visualCanvas);
            }

            // Track movement limits during active captures
            if (poseDetector.initialized && posture) {
                if (this.calibrationState === 'SQUAT_CAPTURE') {
                    this.maxSquatHipY = Math.max(this.maxSquatHipY || posture.hipY, posture.hipY);
                } else if (this.calibrationState === 'JUMP_CAPTURE') {
                    this.peakJumpHeadY = Math.min(this.peakJumpHeadY || posture.headY, posture.headY);
                } else if (this.calibrationState === 'LEAN_LEFT_CAPTURE') {
                    poseDetector.calibrateLeanLeft();
                } else if (this.calibrationState === 'LEAN_RIGHT_CAPTURE') {
                    poseDetector.calibrateLeanRight();
                }
            }
        }

        // 3. Update active Gameplay inputs & PIP camera feedback
        if (this.currentScreen === 'screen-game') {
            const canvasPip = document.getElementById('game-canvas-pose');
            if (canvasPip && poseDetector.initialized) {
                poseDetector.draw(canvasPip, false);
            }

            if (this.activeGame && this.activeGame.state === 'PLAYING') {
                this.activeGame.handlePose(posture, results);
            }
        }
    }

    // Single calibration button: routes to start or confirm depending on state.
    calibrationAction() {
        if (this.calibrationState === 'COMPLETE') {
            this.confirmCalibration();
        } else {
            // Only reachable while IDLE (the button is disabled during a running protocol).
            this.startCalibrationProtocol();
        }
    }

    setCalibrationAction(label, enabled, variant) {
        const btn = document.getElementById('btn-calibration-action');
        if (!btn) return;
        btn.innerText = label;
        btn.classList.remove('yellow', 'green', 'pink');
        btn.classList.add(variant || 'yellow');
        btn.style.opacity = enabled ? '1' : '0.5';
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
    }

    startCalibrationProtocol() {
        audio.init();
        audio.playClick();

        this.calibrationStepIndex = 0;
        this.calibrationState = this.calibrationSequence[0];
        this.calibrationCounter = 30; // 3 seconds at 10fps

        audio.playVoice("Step back until your full body is visible.");
        
        // Reset baselines
        poseDetector.baselines.standingHeadY = null;
        poseDetector.baselines.standingHipY = null;
        poseDetector.baselines.calibrated = false;
        
        // Reset checkmarks; disable the button while the protocol runs.
        document.querySelectorAll('.cal-guide-item').forEach(el => el.classList.remove('active'));
        this.setCalibrationAction('CALIBRATING…', false, 'yellow');

        if (this.calibrationInterval) clearInterval(this.calibrationInterval);
        
        this.poseHeld = false;
        this.visualFlashTimer = 0;
        this.calibrationInterval = setInterval(() => this.tickCalibration(), 100); // 10fps
        this.updateCalibrationFeedback();
    }

    nextCalibrationStep() {
        this.calibrationStepIndex++;
        if (this.calibrationStepIndex < this.calibrationSequence.length) {
            this.calibrationState = this.calibrationSequence[this.calibrationStepIndex];
        } else {
            this.calibrationState = 'COMPLETE';
        }
        return this.calibrationState;
    }

    completeCalibration() {
        this.calibrationState = 'COMPLETE';
        clearInterval(this.calibrationInterval);
        
        poseDetector.finalizeCalibration();

        // The same button now confirms — labelled for the context it was opened from.
        this.setCalibrationAction(this.pendingCircuit ? 'START WORKOUT ▶' : 'CONTINUE ▶', true, 'green');
        audio.playVoice("Calibration complete. Press the button to continue.");
    }

    tickCalibration() {
        if (this.currentScreen !== 'screen-calibration') {
            if (this.calibrationInterval) clearInterval(this.calibrationInterval);
            return;
        }

        const posture = poseDetector.posture;
        if (this.visualFlashTimer > 0) this.visualFlashTimer--;

        // Helper to advance state
        const advance = (elementId, nextVoice) => {
            const el = document.getElementById(elementId);
            if (el) el.classList.add('active');
            const next = this.nextCalibrationStep();
            if (next === 'COMPLETE') {
                this.completeCalibration();
            } else {
                this.calibrationCounter = 3; // 3 reps for the next test
                if (nextVoice) audio.playVoice(nextVoice);
                this.poseHeld = false;
            }
        };

        switch (this.calibrationState) {
            case 'VISIBLE_COUNTDOWN':
                if (posture && posture.isFullyVisible) {
                    if (this.calibrationCounter === 30) {
                        audio.playVoice("Hold still.");
                    }
                    this.calibrationCounter--;
                    if (this.calibrationCounter <= 0) {
                        const success = poseDetector.calibrateStanding();
                        if (success) {
                            audio.playSuccess();
                            const visStep = document.getElementById('cal-step-visible');
                            if (visStep) visStep.classList.add('active');
                            
                            this.calibrationCounter = 3; // Start requiring 3 reps
                            this.poseHeld = false;
                            this.nextCalibrationStep();
                            audio.playVoice("Perfect. Now perform three deep squats.");
                        } else {
                            this.calibrationCounter = 30;
                        }
                    }
                } else {
                    this.calibrationCounter = 30;
                }
                break;

            case 'SQUAT_TEST':
                if (posture.isSquatting && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10; // flash image for 10 ticks (1s)
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-squat', "Great. Now perform three jumps.");
                } else if (!posture.isSquatting) {
                    this.poseHeld = false;
                }
                break;

            case 'JUMP_TEST':
                if (posture.isJumping && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-jump', "Great. Now raise your left knee up three times.");
                } else if (!posture.isJumping) {
                    this.poseHeld = false;
                }
                break;

            case 'HIGHKNEE_LEFT_TEST':
                if (posture.isHighKneeLeft && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-highknee-left', "Now raise your right knee three times.");
                } else if (!posture.isHighKneeLeft) {
                    this.poseHeld = false;
                }
                break;

            case 'HIGHKNEE_RIGHT_TEST':
                if (posture.isHighKneeRight && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-highknee-right', "Excellent. Now throw a high kick with your left leg three times.");
                } else if (!posture.isHighKneeRight) {
                    this.poseHeld = false;
                }
                break;

            case 'KICK_LEFT_TEST':
                if (posture.isKickingLeft && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-kick-left', "Now throw a kick with your right leg three times.");
                } else if (!posture.isKickingLeft) {
                    this.poseHeld = false;
                }
                break;

            case 'KICK_RIGHT_TEST':
                if (posture.isKickingRight && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-kick-right', "Awesome. Now lean your torso to the left three times.");
                } else if (!posture.isKickingRight) {
                    this.poseHeld = false;
                }
                break;

            case 'LEAN_LEFT_TEST':
                if (posture.isLeaningLeft && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-lean-left', "Good. Now lean to the right three times.");
                } else if (!posture.isLeaningLeft) {
                    this.poseHeld = false;
                }
                break;

            case 'LEAN_RIGHT_TEST':
                if (posture.isLeaningRight && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-lean-right', "Excellent. Punch your left arm forward three times.");
                } else if (!posture.isLeaningRight) {
                    this.poseHeld = false;
                }
                break;

            case 'PUNCH_LEFT_TEST':
                if (posture.isPunchingLeft && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-punch-left', "Now punch your right arm three times.");
                } else if (!posture.isPunchingLeft) {
                    this.poseHeld = false;
                }
                break;

            case 'PUNCH_RIGHT_TEST':
                if (posture.isPunchingRight && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-punch-right', "Excellent. Now twist and throw a cross punch to the left.");
                } else if (!posture.isPunchingRight) {
                    this.poseHeld = false;
                }
                break;

            case 'CROSSPUNCH_LEFT_TEST':
                if (posture.isCrossPunchingLeft && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-crosspunch-left', "Now twist and throw a cross punch to the right.");
                } else if (!posture.isCrossPunchingLeft) {
                    this.poseHeld = false;
                }
                break;

            case 'CROSSPUNCH_RIGHT_TEST':
                if (posture.isCrossPunchingRight && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-crosspunch-right', "Now bring both hands up to guard your face three times.");
                } else if (!posture.isCrossPunchingRight) {
                    this.poseHeld = false;
                }
                break;

            case 'GUARD_TEST':
                if (posture.isGuarding && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-guard', "Now perform an uppercut with your left arm.");
                } else if (!posture.isGuarding) {
                    this.poseHeld = false;
                }
                break;

            case 'UPPERCUT_LEFT_TEST':
                if (posture.isUppercutLeft && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-uppercut-left', "Now do an uppercut with your right arm.");
                } else if (!posture.isUppercutLeft) {
                    this.poseHeld = false;
                }
                break;

            case 'UPPERCUT_RIGHT_TEST':
                if (posture.isUppercutRight && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-uppercut-right', "Excellent. Now do a bicep curl with your left arm.");
                } else if (!posture.isUppercutRight) {
                    this.poseHeld = false;
                }
                break;

            case 'CURL_LEFT_TEST':
                if (posture.isCurlingLeft && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-curl-left', "Now do a bicep curl with your right arm.");
                } else if (!posture.isCurlingLeft) {
                    this.poseHeld = false;
                }
                break;

            case 'CURL_RIGHT_TEST':
                if (posture.isCurlingRight && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-curl-right', "Good. Now stand with your feet wide apart, like a sumo wrestler.");
                } else if (!posture.isCurlingRight) {
                    this.poseHeld = false;
                }
                break;

            case 'WIDESTANCE_TEST':
                if (posture.isWideStance && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-widestance', "Almost done. Raise both arms overhead three times.");
                } else if (!posture.isWideStance) {
                    this.poseHeld = false;
                }
                break;

            case 'ARMS_OVERHEAD_TEST':
                if (posture.isArmsOverhead && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-arms-overhead', "Finally, do three standing push ups by pushing arms forward.");
                } else if (!posture.isArmsOverhead) {
                    this.poseHeld = false;
                }
                break;

            case 'PUSHUP_TEST':
                if (posture.isPushingFront && !this.poseHeld) {
                    this.poseHeld = true;
                    this.calibrationCounter--;
                    this.visualFlashTimer = 10;
                    audio.playSuccess();
                    if (this.calibrationCounter <= 0) advance('cal-step-pushup', null);
                } else if (!posture.isPushingFront) {
                    this.poseHeld = false;
                }
                break;
        }
        this.updateCalibrationFeedback();
    }

    updateCalibrationProgress() {
        const fill = document.getElementById('cal-progress-fill');
        if (!fill) return;
        const NAMES = {
            SQUAT_TEST: 'Deep Squat', JUMP_TEST: 'Jump',
            HIGHKNEE_LEFT_TEST: 'High Knee — Left', HIGHKNEE_RIGHT_TEST: 'High Knee — Right',
            KICK_LEFT_TEST: 'Kick — Left', KICK_RIGHT_TEST: 'Kick — Right',
            LEAN_LEFT_TEST: 'Lean — Left', LEAN_RIGHT_TEST: 'Lean — Right',
            PUNCH_LEFT_TEST: 'Punch — Left', PUNCH_RIGHT_TEST: 'Punch — Right',
            CROSSPUNCH_LEFT_TEST: 'Cross Punch — Left', CROSSPUNCH_RIGHT_TEST: 'Cross Punch — Right',
            GUARD_TEST: 'Guard / Block',
            UPPERCUT_LEFT_TEST: 'Uppercut — Left', UPPERCUT_RIGHT_TEST: 'Uppercut — Right',
            CURL_LEFT_TEST: 'Bicep Curl — Left', CURL_RIGHT_TEST: 'Bicep Curl — Right',
            WIDESTANCE_TEST: 'Wide Stance', ARMS_OVERHEAD_TEST: 'Arms Overhead',
            PUSHUP_TEST: 'Standing Push-up', VISIBLE_COUNTDOWN: 'Get in frame'
        };
        const total = this.calibrationSequence.length || 1;
        const idx = this.calibrationStepIndex || 0;
        const state = this.calibrationState;
        const isComplete = state === 'COMPLETE' || idx >= total;
        const done = isComplete ? total : idx;
        const pctVal = Math.round((done / total) * 100);

        fill.style.width = pctVal + '%';
        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
        set('cal-progress-pct', pctVal + '%');
        set('cal-progress-label', isComplete ? `COMPLETE · ${total}/${total}` : `STEP ${Math.min(idx + 1, total)} / ${total}`);

        if (isComplete) {
            set('cal-current-name', 'Calibration complete!');
            set('cal-next-step', '');
        } else if (state === 'IDLE') {
            set('cal-current-name', 'Press START to begin');
            set('cal-next-step', total > 1 ? `FIRST: ${NAMES[this.calibrationSequence[0]] || ''}` : '');
        } else {
            let nm = NAMES[state] || 'Get ready';
            if (state !== 'VISIBLE_COUNTDOWN' && NAMES[state]) {
                const completed = Math.min(3, Math.max(0, 3 - this.calibrationCounter));
                nm += `  (${completed}/3)`;
            }
            set('cal-current-name', nm);
            const nextState = this.calibrationSequence[idx + 1];
            set('cal-next-step', (nextState && NAMES[nextState]) ? `NEXT: ${NAMES[nextState]}` : '');
        }
    }

    updateCalibrationFeedback() {
        this.updateCalibrationProgress();
        const feedbackBox = document.getElementById('calibration-feedback');
        const visualCanvas = document.getElementById('visual-aid-canvas');
        if (visualCanvas) {
            this.drawVisualAidCanvas(visualCanvas);
        }

        if (!feedbackBox) return;

        const posture = poseDetector.posture;
        const uiUpdate = (title, color, stepId, baseText) => {
            feedbackBox.innerHTML = `${title}<br>REPS REMAINING: ${this.calibrationCounter}`;
            feedbackBox.style.color = color;
            
            if (stepId && baseText) {
                const el = document.getElementById(stepId);
                if (el) {
                    const spans = el.getElementsByTagName('span');
                    if (spans.length > 1) {
                        const completed = Math.max(0, 3 - this.calibrationCounter);
                        spans[1].innerText = `${baseText} (${completed}/3)`;
                    }
                }
            }
        };
        
        switch (this.calibrationState) {
            case 'IDLE':
                feedbackBox.innerHTML = "STAND STILL IN FRONT OF THE CAMERA AND PRESS 'START CALIBRATION'";
                feedbackBox.style.color = "var(--primary-cyan)";
                break;
            case 'VISIBLE_COUNTDOWN':
                if (posture && posture.isFullyVisible) {
                    feedbackBox.innerHTML = `BODY DETECTED!<br>STABILIZING...`;
                    feedbackBox.style.color = "var(--success-green)";
                } else {
                    feedbackBox.innerHTML = `STAND SO YOUR FULL BODY IS VISIBLE IN FRAME.`;
                    feedbackBox.style.color = "var(--primary-cyan)";
                }
                break;
            case 'SQUAT_TEST':
                uiUpdate('PERFORM DEEP SQUATS', 'var(--accent-yellow)', 'cal-step-squat', 'Deep Squat');
                break;
            case 'JUMP_TEST':
                uiUpdate('PERFORM JUMPS IN PLACE', 'var(--primary-neon-pink)', 'cal-step-jump', 'Jump');
                break;
            case 'HIGHKNEE_LEFT_TEST':
                uiUpdate('RAISE LEFT KNEE HIGH', 'var(--primary-neon-pink)', 'cal-step-highknee-left', 'High Knee Left');
                break;
            case 'HIGHKNEE_RIGHT_TEST':
                uiUpdate('RAISE RIGHT KNEE HIGH', 'var(--primary-neon-pink)', 'cal-step-highknee-right', 'High Knee Right');
                break;
            case 'KICK_LEFT_TEST':
                uiUpdate('THROW LEFT LEG KICK', 'var(--primary-neon-pink)', 'cal-step-kick-left', 'Kick Left');
                break;
            case 'KICK_RIGHT_TEST':
                uiUpdate('THROW RIGHT LEG KICK', 'var(--primary-neon-pink)', 'cal-step-kick-right', 'Kick Right');
                break;
            case 'LEAN_LEFT_TEST':
                uiUpdate('LEAN TORSO TO THE LEFT', 'var(--primary-cyan)', 'cal-step-lean-left', 'Lean Left');
                break;
            case 'LEAN_RIGHT_TEST':
                uiUpdate('LEAN TORSO TO THE RIGHT', 'var(--primary-cyan)', 'cal-step-lean-right', 'Lean Right');
                break;
            case 'PUNCH_LEFT_TEST':
                uiUpdate('PUNCH LEFT ARM FORWARD', 'var(--primary-neon-pink)', 'cal-step-punch-left', 'Punch Left');
                break;
            case 'PUNCH_RIGHT_TEST':
                uiUpdate('PUNCH RIGHT ARM FORWARD', 'var(--primary-neon-pink)', 'cal-step-punch-right', 'Punch Right');
                break;
            case 'CROSSPUNCH_LEFT_TEST':
                uiUpdate('CROSS PUNCH TO THE LEFT (RIGHT ARM)', 'var(--primary-neon-pink)', 'cal-step-crosspunch-left', 'Cross Punch Left');
                break;
            case 'CROSSPUNCH_RIGHT_TEST':
                uiUpdate('CROSS PUNCH TO THE RIGHT (LEFT ARM)', 'var(--primary-neon-pink)', 'cal-step-crosspunch-right', 'Cross Punch Right');
                break;
            case 'GUARD_TEST':
                uiUpdate('BRING BOTH WRISTS TO FACE TO GUARD', 'var(--accent-yellow)', 'cal-step-guard', 'Guard / Block');
                break;
            case 'UPPERCUT_LEFT_TEST':
                uiUpdate('PERFORM UPPERCUT (LEFT ARM)', 'var(--primary-neon-pink)', 'cal-step-uppercut-left', 'Uppercut Left');
                break;
            case 'UPPERCUT_RIGHT_TEST':
                uiUpdate('PERFORM UPPERCUT (RIGHT ARM)', 'var(--primary-neon-pink)', 'cal-step-uppercut-right', 'Uppercut Right');
                break;
            case 'CURL_LEFT_TEST':
                uiUpdate('BICEP CURL (LEFT ARM)', 'var(--accent-yellow)', 'cal-step-curl-left', 'Bicep Curl Left');
                break;
            case 'CURL_RIGHT_TEST':
                uiUpdate('BICEP CURL (RIGHT ARM)', 'var(--accent-yellow)', 'cal-step-curl-right', 'Bicep Curl Right');
                break;
            case 'WIDESTANCE_TEST':
                uiUpdate('SPREAD FEET WIDE', 'var(--success-green)', 'cal-step-widestance', 'Wide Stance');
                break;
            case 'ARMS_OVERHEAD_TEST':
                uiUpdate('RAISE BOTH ARMS OVERHEAD', 'var(--accent-yellow)', 'cal-step-arms-overhead', 'Arms Overhead');
                break;
            case 'PUSHUP_TEST':
                uiUpdate('PUSH ARMS FORWARD (STANDING PUSHUP)', 'var(--success-green)', 'cal-step-pushup', 'Standing Push-up');
                break;
            case 'COMPLETE':
                feedbackBox.innerHTML = "CALIBRATION COMPLETE!<br>PRESS THE BUTTON BELOW TO CONTINUE.";
                feedbackBox.style.color = "var(--success-green)";
                break;
        }
    }

    drawVisualAidCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let x = 20; x < width; x += 20) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 20; y < height; y += 20) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        // Create images statically if not already created
        if (!this.calibrationImages) {
            this.calibrationImages = {
                squat: new Image(),
                jump: new Image(),
                lean: new Image(),
                punch: new Image(),
                overhead: new Image()
            };
            this.calibrationImages.squat.src = "file:///C:/Users/admin/.gemini/antigravity-ide/brain/b70f3253-0f9c-40d5-8e7c-b38f9e2f27f2/cyberpunk_girl_slide_1782757105833.png";
            this.calibrationImages.jump.src = "file:///C:/Users/admin/.gemini/antigravity-ide/brain/b70f3253-0f9c-40d5-8e7c-b38f9e2f27f2/cyberpunk_girl_jump_1782756382122.png";
            this.calibrationImages.lean.src = "file:///C:/Users/admin/.gemini/antigravity-ide/brain/b70f3253-0f9c-40d5-8e7c-b38f9e2f27f2/rope_climber_raw_1782856662957.png";
            this.calibrationImages.punch.src = "file:///C:/Users/admin/.gemini/antigravity-ide/brain/b70f3253-0f9c-40d5-8e7c-b38f9e2f27f2/hero_punch_1782858738212.png";
            this.calibrationImages.overhead.src = "file:///C:/Users/admin/.gemini/antigravity-ide/brain/b70f3253-0f9c-40d5-8e7c-b38f9e2f27f2/climber_sprite_v2_1782759125429.png";
        }

        // Draw image if visualFlashTimer is active
        if (this.visualFlashTimer > 0) {
            let imgToDraw = null;
            if (this.calibrationState === 'SQUAT_TEST') imgToDraw = this.calibrationImages.squat;
            else if (this.calibrationState === 'JUMP_TEST') imgToDraw = this.calibrationImages.jump;
            else if (this.calibrationState === 'LEAN_LEFT_TEST' || this.calibrationState === 'LEAN_RIGHT_TEST') imgToDraw = this.calibrationImages.lean;
            else if (this.calibrationState === 'PUNCH_LEFT_TEST' || this.calibrationState === 'PUNCH_RIGHT_TEST') imgToDraw = this.calibrationImages.punch;
            else if (this.calibrationState === 'ARMS_OVERHEAD_TEST' || this.calibrationState === 'PUSHUP_TEST') imgToDraw = this.calibrationImages.overhead;

            if (imgToDraw && imgToDraw.complete) {
                // scale to fit canvas
                const scale = Math.min(width / imgToDraw.width, height / imgToDraw.height) * 0.8;
                const dw = imgToDraw.width * scale;
                const dh = imgToDraw.height * scale;
                const dx = (width - dw) / 2;
                const dy = (height - dh) / 2;
                
                // Add a glow effect
                ctx.shadowColor = "var(--primary-cyan)";
                ctx.shadowBlur = 20;
                ctx.drawImage(imgToDraw, dx, dy, dw, dh);
                ctx.shadowBlur = 0; // reset
                
                // Draw a flashing success border
                ctx.strokeStyle = "rgba(57, 255, 20, " + (this.visualFlashTimer / 10) + ")";
                ctx.lineWidth = 5;
                ctx.strokeRect(0, 0, width, height);
            }
        } else {
            // Draw a subtle placeholder to indicate it's waiting
            ctx.fillStyle = "rgba(0, 240, 255, 0.5)";
            ctx.font = "12px var(--font-pixel)";
            ctx.textAlign = "center";
            ctx.fillText("WAITING FOR POSE...", width/2, height/2);
        }
    }
}

// Instantiate and start app on window load
const app = new AppController();
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});
