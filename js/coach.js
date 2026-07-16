/**
 * Coach — an on-screen "what move do I make?" prompt for FIT-ARCADE games.
 *
 * The player stands several feet from the screen, so early on it's hard to know
 * which move a given obstacle wants. Each game calls `Coach.cue('JUMP')` when a
 * move becomes the correct one; Coach shows a big retro 16-bit pixel-font prompt
 * (top-centre, out of the way of gameplay) and speaks it ONCE. It only fires for
 * the first MAX moves of a session, then gets out of the way.
 *
 * Loaded inside each standalone game (after js/motion-bridge.js).
 */
(function () {
    const MAX = 10;               // only coach the first N moves of a session
    const spoken = {};            // speak each distinct cue at most once
    let shown = 0, current = null, hideTimer = null, el = null;

    function ensureEl() {
        if (el) return el;
        // Retro pixel font (harmless if already present in the page).
        if (!document.querySelector('link[data-coach-font]')) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            l.setAttribute('data-coach-font', '1');
            document.head.appendChild(l);
        }
        el = document.createElement('div');
        el.id = 'coach-cue';
        el.setAttribute('aria-live', 'assertive');
        Object.assign(el.style, {
            position: 'fixed', left: '50%', top: '15%', transform: 'translate(-50%, -50%)',
            zIndex: '99998', pointerEvents: 'none',
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 'clamp(18px, 4.4vw, 40px)',
            color: '#ffffff', letterSpacing: '2px', textAlign: 'center', whiteSpace: 'nowrap',
            textShadow: '3px 3px 0 #000, 0 0 10px #00f0ff, 0 0 20px #ff007f',
            opacity: '0', transition: 'opacity 0.12s ease-out'
        });
        (document.body || document.documentElement).appendChild(el);

        // A short "pop" so the cue reads as a retro alert.
        if (!document.querySelector('style[data-coach-css]')) {
            const s = document.createElement('style');
            s.setAttribute('data-coach-css', '1');
            s.textContent = '@keyframes coach-pop{0%{transform:translate(-50%,-50%) scale(0.6)}55%{transform:translate(-50%,-50%) scale(1.15)}100%{transform:translate(-50%,-50%) scale(1)}}#coach-cue.pop{animation:coach-pop .3s ease-out}';
            document.head.appendChild(s);
        }
        return el;
    }

    function speak(text) {
        try {
            if (!window.speechSynthesis || spoken[text]) return;
            spoken[text] = true;
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        } catch (e) { /* no-op */ }
    }

    // Map a spoken phrase to a machine move key for the hub's stick-figure demo.
    function moveKey(s) {
        s = (s || '').toLowerCase();
        if (s.indexOf('punch left') > -1) return 'punchLeft';
        if (s.indexOf('punch right') > -1) return 'punchRight';
        if (s.indexOf('lean left') > -1) return 'leanLeft';
        if (s.indexOf('lean right') > -1) return 'leanRight';
        if (s.indexOf('push') > -1) return 'pushup';
        if (s.indexOf('raise') > -1 || s.indexOf('arms') > -1) return 'armsOverhead';
        if (s.indexOf('flatten') > -1 || s.indexOf('duck') > -1 || s.indexOf('squat') > -1) return 'squat';
        if (s.indexOf('jump') > -1) return 'jump';
        return null;
    }
    // Tell the hub which move is expected NOW (drives the left demo box). Uncapped.
    function broadcast(say, text) {
        const mk = moveKey(say || text);
        if (mk) { try { (window.parent || window).postMessage({ source: 'fitarcade-game', kind: 'expectMove', move: mk }, '*'); } catch (e) {} }
    }

    window.Coach = {
        /**
         * Show + speak a move cue. Call it repeatedly while the move stays valid —
         * it de-dupes so it only counts/speaks once per prompt. Always broadcasts the
         * expected move to the hub demo box (that part is NOT capped).
         * @param {string} text   on-screen text, e.g. 'JUMP!' or 'DUCK!'
         * @param {string} [say]  spoken phrase (defaults to text minus punctuation)
         * @param {number} [holdMs] how long to keep it up (default 1500)
         */
        cue(text, say, holdMs) {
            broadcast(say, text);
            if (shown >= MAX || current === text) return;
            ensureEl();
            current = text;
            shown++;
            el.textContent = text;
            el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
            el.style.opacity = '1';
            speak(say || text.replace(/[^A-Za-z0-9 ]/g, '').trim());
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => { el.style.opacity = '0'; current = null; }, holdMs || 1500);
        },
        /** Force-hide the current cue (e.g. once the move window has passed). */
        clear() { if (el) el.style.opacity = '0'; current = null; if (hideTimer) clearTimeout(hideTimer); },
        /** True once the first-N coaching budget is spent. */
        done() { return shown >= MAX; }
    };
})();
