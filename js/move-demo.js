/**
 * MoveDemo — a looping neon "stick-figure" that demonstrates the EXPECTED move.
 *
 * Lives in the hub (next to the game stage, mirroring the live-camera box). Games
 * broadcast which move is currently expected (see js/coach.js → postMessage
 * {kind:'expectMove'}); the hub calls MoveDemo.show(move) and this animates a
 * skeleton — drawn with the same joint-dot + bone style as the MediaPipe overlay —
 * performing that move on a ~1.2s loop, all game long.
 */
const MoveDemo = (function () {
    // Base standing skeleton in normalized [0..1] canvas coords (front view).
    const BASE = {
        nose: [0.50, 0.13], lsh: [0.40, 0.30], rsh: [0.60, 0.30],
        lel: [0.34, 0.45], rel: [0.66, 0.45], lwr: [0.32, 0.60], rwr: [0.68, 0.60],
        lhip: [0.44, 0.57], rhip: [0.56, 0.57], lkn: [0.43, 0.76], rkn: [0.57, 0.76],
        lank: [0.43, 0.94], rank: [0.57, 0.94]
    };
    const BONES = [
        ['lsh', 'rsh'], ['nose', 'lsh'], ['nose', 'rsh'],
        ['lsh', 'lel'], ['lel', 'lwr'], ['rsh', 'rel'], ['rel', 'rwr'],
        ['lsh', 'lhip'], ['rsh', 'rhip'], ['lhip', 'rhip'],
        ['lhip', 'lkn'], ['lkn', 'lank'], ['rhip', 'rkn'], ['rkn', 'rank']
    ];
    const JOINTS = Object.keys(BASE);

    let canvas = null, ctx = null, raf = null, active = false;
    let move = 'idle', t = 0, last = 0;

    // Returns a copy of BASE with the given move applied at loop phase p (0..1).
    function pose(m, p) {
        const j = {};
        for (const k in BASE) j[k] = BASE[k].slice();
        const hump = Math.sin(p * Math.PI);          // 0 → 1 → 0 across the loop
        const beat = Math.max(0, Math.sin(p * Math.PI * 2));

        switch (m) {
            case 'jump': {
                const off = -0.15 * hump;             // whole body leaps up
                for (const k in j) j[k][1] += off;
                const a = 0.05 * hump;                // arms lift
                j.lwr[1] -= a; j.rwr[1] -= a; j.lel[1] -= a * 0.5; j.rel[1] -= a * 0.5;
                break;
            }
            case 'squat': {                            // squat / duck / flatten
                const d = 0.15 * hump;
                ['nose', 'lsh', 'rsh', 'lel', 'rel', 'lwr', 'rwr', 'lhip', 'rhip'].forEach(k => j[k][1] += d);
                j.lkn[1] += d * 0.4; j.rkn[1] += d * 0.4;   // knees bend
                j.lkn[0] -= 0.05 * hump; j.rkn[0] += 0.05 * hump;
                break;
            }
            case 'pushup': {                           // standing push-up: arms punch forward together
                const e = hump;
                j.lwr[0] = 0.42; j.rwr[0] = 0.58;
                j.lwr[1] = 0.45 - 0.02 * e; j.rwr[1] = 0.45 - 0.02 * e;
                j.lel[0] = 0.40; j.rel[0] = 0.60; j.lel[1] = 0.45; j.rel[1] = 0.45;
                break;
            }
            case 'armsOverhead': {                     // reach both arms up
                const u = hump;
                j.lwr[1] = 0.60 - 0.56 * u; j.rwr[1] = 0.60 - 0.56 * u;
                j.lwr[0] = 0.32 + 0.14 * u; j.rwr[0] = 0.68 - 0.14 * u;
                j.lel[1] = 0.45 - 0.30 * u; j.rel[1] = 0.45 - 0.30 * u;
                j.lel[0] = 0.34 + 0.05 * u; j.rel[0] = 0.66 - 0.05 * u;
                break;
            }
            case 'punchLeft': {
                j.lwr[0] = 0.32 - 0.24 * beat; j.lwr[1] = 0.44;
                j.lel[0] = 0.36 - 0.12 * beat; j.lel[1] = 0.44;
                break;
            }
            case 'punchRight': {
                j.rwr[0] = 0.68 + 0.24 * beat; j.rwr[1] = 0.44;
                j.rel[0] = 0.64 + 0.12 * beat; j.rel[1] = 0.44;
                break;
            }
            case 'leanLeft': {
                const shift = -0.12 * hump;
                ['nose', 'lsh', 'rsh', 'lel', 'rel', 'lwr', 'rwr'].forEach(k => j[k][0] += shift);
                j.nose[0] += shift * 0.4;
                break;
            }
            case 'leanRight': {
                const shift = 0.12 * hump;
                ['nose', 'lsh', 'rsh', 'lel', 'rel', 'lwr', 'rwr'].forEach(k => j[k][0] += shift);
                j.nose[0] += shift * 0.4;
                break;
            }
            default: {                                 // idle: gentle bob
                const off = 0.012 * Math.sin(p * Math.PI * 2);
                for (const k in j) j[k][1] += off;
            }
        }
        return j;
    }

    function draw() {
        if (!ctx) return;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const j = pose(move, t);

        // bones (neon pink)
        ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.strokeStyle = '#ff007f'; ctx.shadowColor = '#ff007f'; ctx.shadowBlur = 12;
        BONES.forEach(([a, b]) => {
            ctx.beginPath();
            ctx.moveTo(j[a][0] * W, j[a][1] * H);
            ctx.lineTo(j[b][0] * W, j[b][1] * H);
            ctx.stroke();
        });

        // joints (neon cyan)
        ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 14; ctx.fillStyle = '#00f0ff';
        JOINTS.forEach(k => {
            ctx.beginPath();
            ctx.arc(j[k][0] * W, j[k][1] * H, k === 'nose' ? 9 : 6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.shadowBlur = 0;
    }

    function loop(ts) {
        if (!active) return;
        const dt = last ? (ts - last) / 1000 : 0;
        last = ts;
        t = (t + dt / 1.2) % 1;   // ~1.2s per loop
        draw();
        raf = requestAnimationFrame(loop);
    }

    return {
        init(cv) { canvas = cv; ctx = cv.getContext('2d'); },
        show(m) { if (m && m !== move) { move = m; t = 0; } },
        start() { if (active) return; active = true; last = 0; raf = requestAnimationFrame(loop); },
        stop() {
            active = false;
            if (raf) { cancelAnimationFrame(raf); raf = null; }
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
})();
