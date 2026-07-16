/**
 * Cloud — FIT-ARCADE Phase 1: accounts + cloud personalization (Supabase).
 *
 * DROP-IN + INERT UNTIL CONFIGURED. With the placeholder keys below it installs a
 * no-op stub (window.Cloud.user === null), imports nothing, injects no UI, and makes
 * zero network calls — so the local-only app is completely unchanged. Paste your
 * Supabase Project URL + anon key and it activates: a header ACCOUNT button, auth,
 * consent capture, one-time localStorage import, and cloud sync.
 *
 * Loaded as a MODULE:  <script type="module" src="js/cloud.js"></script>
 * (so it uses window.* + localStorage directly — it never depends on the classic-script
 *  `const` globals like Store/motionBus.)
 *
 * Security: the anon key is public-safe — Row-Level Security is the boundary (see
 * supabase/schema.sql). NEVER put the service_role key here.  Full spec: docs/phase1-accounts.md
 */

// ==== PASTE YOUR KEYS HERE ==================================================
const SB_URL  = 'YOUR_SUPABASE_URL';        // e.g. https://abcd1234.supabase.co
const SB_ANON = 'YOUR_SUPABASE_ANON_KEY';   // the "anon public" key (safe in the browser)
const POLICY_VERSION = '2026-07-01';        // bump when your ToS/Privacy Policy changes
// ===========================================================================

const CONFIGURED = /^https?:\/\/.+\.supabase\.co/.test(SB_URL) && SB_ANON.length > 20 && !SB_ANON.includes('YOUR_');

// A stub so the write-through hooks (`window.Cloud?.user`, `Cloud.saveProfile(...)`) are
// always safe. Every method is a no-op; user stays null so guarded calls simply skip.
const Stub = {
    configured: false, user: null,
    init() {}, signInGoogle() {}, signInEmail() {}, signOut() {},
    recordConsent() {}, saveProfile() {}, addWorkout() {}, saveProgress() {}, recordSession() {},
    getProfile: async () => null, getWorkouts: async () => [], getProgress: async () => null,
    exportMyData() {}, deleteMyData() {}
};
window.Cloud = Stub;

if (!CONFIGURED) {
    console.info('[Cloud] Supabase not configured — FIT-ARCADE running local-only. ' +
                 'Paste your Project URL + anon key in js/cloud.js to enable accounts.');
} else {
    boot();
}

async function boot() {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const sb = createClient(SB_URL, SB_ANON);

    // ---- localStorage <-> cloud field mappers (match js/store.js shapes) ----
    const LS = {
        profile:  'fitarcade.profile',      // {age, restHR, fitness}
        calib:    'fitarcade.calibration',
        history:  'fitarcade.history',
        progress: 'fitarcade.progress',
        duration: 'fitarcade.durationMin',
        rhythm:   'fitarcade.rhythmMode',
        migrated: 'fitarcade.migrated'
    };
    const getJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
    const normDate = (s) => { if (!s) return null; const [y, m, d] = String(s).split('-'); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

    const toWorkoutRow = (w) => ({
        program: w.program, reps: w.reps | 0, score: w.score | 0, elapsed_sec: w.elapsed | 0,
        calories: w.kcal | 0, avg_hr: w.avgHR || null, peak_hr: w.peakHR || null,
        games_played: w.games | 0, xp_awarded: w.xp | 0
    });
    const fromWorkoutRow = (r) => ({
        date: (r.created_at || '').slice(0, 10), program: r.program, reps: r.reps, kcal: r.calories,
        elapsed: r.elapsed_sec, avgHR: r.avg_hr, peakHR: r.peak_hr, games: r.games_played, xp: r.xp_awarded
    });
    const toProgressRow = (p) => ({
        xp: p.xp | 0, level: p.level | 1, streak: p.streak | 0, last_workout_date: normDate(p.lastWorkoutDate),
        total_workouts: p.totalWorkouts | 0, total_reps: p.totalReps | 0, total_calories: p.totalCalories | 0
    });
    const fromProgressRow = (r) => ({
        xp: r.xp, level: r.level, streak: r.streak, lastWorkoutDate: r.last_workout_date,
        totalWorkouts: r.total_workouts, totalReps: r.total_reps, totalCalories: r.total_calories
    });

    const Cloud = {
        configured: true,
        user: null,

        async init() {
            const { data } = await sb.auth.getSession();
            this.user = data.session?.user || null;
            sb.auth.onAuthStateChange(async (_e, s) => {
                this.user = s?.user || null;
                if (this.user) await this._onLogin();
                this._renderAuthUI();
            });
            if (this.user) await this._onLogin();
            this._injectUI();
            this._renderAuthUI();
        },

        // ---- auth ----
        signInGoogle() { return sb.auth.signInWithOAuth({ provider: 'google' }); },
        signInEmail(email) { return sb.auth.signInWithOtp({ email }); },
        signOut() { return sb.auth.signOut(); },

        recordConsent(type, granted = true) {
            if (!this.user) return;
            return sb.from('consent').insert({ user_id: this.user.id, consent_type: type, granted, policy_version: POLICY_VERSION });
        },

        // ---- reads/writes (RLS scopes everything to the current user) ----
        async getProfile() { const { data } = await sb.from('profiles').select('*').eq('id', this.user.id).single(); return data; },
        saveProfile(p) { if (!this.user) return; return sb.from('profiles').upsert({ id: this.user.id, ...p }); },
        addWorkout(w) { if (!this.user) return; return sb.from('workouts').insert({ user_id: this.user.id, ...toWorkoutRow(w) }); },
        async getWorkouts(limit = 50) { const { data } = await sb.from('workouts').select('*').order('created_at', { ascending: false }).limit(limit); return data || []; },
        async getProgress() { const { data } = await sb.from('progress').select('*').eq('user_id', this.user.id).single(); return data; },
        saveProgress(p) { if (!this.user) return; return sb.from('progress').upsert({ user_id: this.user.id, ...toProgressRow(p) }); },

        /** One call from recordWorkout(): mirror the session's progress + workout row. */
        recordSession(prog, workout) {
            if (!this.user) return;
            this.saveProgress(prog);
            this.addWorkout(workout);
        },

        // ---- login lifecycle: consent -> one-time import -> hydrate cache ----
        async _onLogin() {
            if (localStorage.getItem('fitarcade.consent.account') !== POLICY_VERSION) {
                await this.recordConsent('account_tos', true);
                localStorage.setItem('fitarcade.consent.account', POLICY_VERSION);
            }
            await this._migrateLocalIfNeeded();
            await this._hydrateLocalCache();
        },

        async _migrateLocalIfNeeded() {
            if (localStorage.getItem(LS.migrated)) return;
            const cloud = await this.getProgress();
            const cloudEmpty = !cloud || (cloud.total_workouts === 0 && cloud.xp === 0);
            const localProg = getJSON(LS.progress, null);
            const localProfile = getJSON(LS.profile, null);
            if (cloudEmpty && (localProg || localProfile)) {
                if (localProfile) await this.saveProfile({
                    age: localProfile.age, resting_hr: localProfile.restHR, fitness_level: localProfile.fitness,
                    calibration: getJSON(LS.calib, null),
                    preferences: { durationMin: +localStorage.getItem(LS.duration) || undefined, rhythmMode: localStorage.getItem(LS.rhythm) || undefined }
                });
                const hist = getJSON(LS.history, []);
                if (hist.length) await sb.from('workouts').insert(hist.map((h) => ({ user_id: this.user.id, ...toWorkoutRow(h) })));
                if (localProg) await this.saveProgress(localProg);
            }
            localStorage.setItem(LS.migrated, '1');
        },

        // pull cloud -> write the SAME localStorage keys the UI already reads, then refresh
        async _hydrateLocalCache() {
            const [p, prog, hist] = await Promise.all([this.getProfile(), this.getProgress(), this.getWorkouts()]);
            if (p) {
                localStorage.setItem(LS.profile, JSON.stringify({ age: p.age, restHR: p.resting_hr, fitness: p.fitness_level }));
                if (p.calibration) localStorage.setItem(LS.calib, JSON.stringify(p.calibration));
                if (p.preferences?.durationMin) localStorage.setItem(LS.duration, String(p.preferences.durationMin));
                if (p.preferences?.rhythmMode) localStorage.setItem(LS.rhythm, p.preferences.rhythmMode);
            }
            if (prog) localStorage.setItem(LS.progress, JSON.stringify(fromProgressRow(prog)));
            if (hist) localStorage.setItem(LS.history, JSON.stringify(hist.map(fromWorkoutRow)));
            // let the existing UI repaint from the freshly-hydrated cache
            try { window.renderProgress && window.renderProgress(); } catch (e) {}
            try { window.renderPlan && window.renderPlan(); } catch (e) {}
        },

        // ---- GDPR: export + delete ----
        async exportMyData() {
            const [profile, workouts, progress, consent] = await Promise.all([
                this.getProfile(), this.getWorkouts(1000), this.getProgress(),
                sb.from('consent').select('*').then((r) => r.data || [])
            ]);
            const blob = new Blob([JSON.stringify({ profile, workouts, progress, consent }, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'fitarcade-my-data.json';
            a.click();
        },
        async deleteMyData() {
            if (!this.user) return;
            if (!confirm('Delete all your FIT-ARCADE data? This cannot be undone.')) return;
            await sb.from('workouts').delete().eq('user_id', this.user.id);
            await sb.from('progress').delete().eq('user_id', this.user.id);
            await sb.from('profiles').delete().eq('id', this.user.id);
            Object.values(LS).forEach((k) => localStorage.removeItem(k));
            alert('Your data was deleted. (Full account removal also needs a "delete-account" Edge Function — see docs/phase1-accounts.md.)');
            await this.signOut();
        },

        // ---- minimal on-brand UI (reuses existing arcade classes) ----
        _injectUI() {
            if (document.getElementById('btn-account')) return;
            const host = document.getElementById('btn-sound-toggle')?.parentElement || document.body;
            const btn = document.createElement('button');
            btn.id = 'btn-account';
            btn.className = 'btn-arcade';
            btn.style.cssText = 'padding:0.5rem 1rem;font-size:0.65rem;';
            btn.textContent = 'SIGN IN';
            btn.onclick = () => this._toggleModal(true);
            host.appendChild(btn);

            const modal = document.createElement('div');
            modal.id = 'account-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
              <div class="arcade-panel" style="max-width:420px;width:90%;">
                <div class="panel-header"><span>ACCOUNT</span>
                  <button class="btn-arcade pink" id="acct-close" style="padding:0.35rem 0.8rem;font-size:0.6rem;">CLOSE</button></div>
                <div id="acct-signedout" style="padding:0.5rem 0;">
                  <button class="btn-arcade yellow" id="acct-google" style="width:100%;margin-bottom:0.8rem;">CONTINUE WITH GOOGLE</button>
                  <input id="acct-email" type="email" class="neon-number" style="width:100%;margin-bottom:0.6rem;" placeholder="you@email.com">
                  <button class="btn-arcade" id="acct-magic" style="width:100%;margin-bottom:1rem;">EMAIL ME A MAGIC LINK</button>
                  <label style="display:flex;gap:0.5rem;align-items:flex-start;font-size:0.7rem;color:var(--text-muted);line-height:1.5;">
                    <input type="checkbox" id="acct-consent" style="margin-top:2px;">
                    <span>I agree to the Terms &amp; Privacy Policy. My workout data (numbers only) is stored to sync across devices.</span></label>
                </div>
                <div id="acct-signedin" style="display:none;padding:0.5rem 0;">
                  <p id="acct-who" style="font-size:0.8rem;color:#fff;margin-bottom:1rem;"></p>
                  <button class="btn-arcade" id="acct-export" style="width:100%;margin-bottom:0.6rem;">EXPORT MY DATA</button>
                  <button class="btn-arcade pink" id="acct-delete" style="width:100%;margin-bottom:0.6rem;">DELETE MY DATA</button>
                  <button class="btn-arcade yellow" id="acct-signout" style="width:100%;">SIGN OUT</button>
                </div>
              </div>`;
            document.body.appendChild(modal);

            const consent = modal.querySelector('#acct-consent');
            const gate = (fn) => () => { if (!consent.checked) { alert('Please accept the Terms & Privacy Policy first.'); return; } fn(); };
            modal.querySelector('#acct-close').onclick = () => this._toggleModal(false);
            modal.querySelector('#acct-google').onclick = gate(() => this.signInGoogle());
            modal.querySelector('#acct-magic').onclick = gate(() => {
                const em = modal.querySelector('#acct-email').value.trim();
                if (em) { this.signInEmail(em); alert('Check your email for the magic link.'); }
            });
            modal.querySelector('#acct-export').onclick = () => this.exportMyData();
            modal.querySelector('#acct-delete').onclick = () => this.deleteMyData();
            modal.querySelector('#acct-signout').onclick = () => this.signOut();
        },
        _toggleModal(show) { const m = document.getElementById('account-modal'); if (m) m.classList.toggle('active', show); },
        _renderAuthUI() {
            const btn = document.getElementById('btn-account');
            const out = document.getElementById('acct-signedout');
            const inn = document.getElementById('acct-signedin');
            const who = document.getElementById('acct-who');
            if (!btn) return;
            if (this.user) {
                btn.textContent = (this.user.email || 'ACCOUNT').split('@')[0].toUpperCase().slice(0, 10);
                if (out) out.style.display = 'none';
                if (inn) inn.style.display = 'block';
                if (who) who.textContent = 'Signed in as ' + (this.user.email || this.user.id);
            } else {
                btn.textContent = 'SIGN IN';
                if (out) out.style.display = 'block';
                if (inn) inn.style.display = 'none';
            }
        }
    };

    window.Cloud = Cloud;
    Cloud.init();
}
