# FIT-ARCADE — Phase 1: Accounts + Cloud Personalization

Turns the current all-local app into a cross-device personalized experience with
**minimal legal risk** (numeric profile/metrics only — **no images, no biometrics**).
Schema lives in [`../supabase/schema.sql`](../supabase/schema.sql).

## 1. What moves to the cloud (current `localStorage` → tables)

| Current key (`js/store.js` / `index.html`) | Shape | Cloud destination |
|---|---|---|
| `fitarcade.profile` | `{age, restHR, fitness}` | `profiles.age / resting_hr / fitness_level` (+ derived `base_pace`) |
| `fitarcade.calibration` | pose baselines object | `profiles.calibration` (jsonb) |
| `fitarcade.durationMin` | number | `profiles.preferences.durationMin` |
| `fitarcade.rhythmMode` | `'rhythmic'|'random'` | `profiles.preferences.rhythmMode` |
| (sound/volume settings) | — | `profiles.preferences.*` |
| `fitarcade.history` | `[{reps,score,elapsed,hrSum,hrCount,hrPeak,games,program}]` | one `workouts` row each (`avg_hr = round(hrSum/hrCount)`, `peak_hr = hrPeak`) |
| `fitarcade.progress` | `{xp,level,streak,lastWorkoutDate,total*}` | the `progress` row |

Nothing sensitive leaves the browser: **no video, no face, no raw rPPG** — just the
numbers the UI already shows.

## 2. Supabase setup (one time)
1. Create a project at supabase.com. **Pick an EU region if you'll have EU users** (GDPR data residency).
2. SQL editor → paste and run [`supabase/schema.sql`](../supabase/schema.sql).
3. Auth → Providers: enable **Google OAuth** (frictionless) and **Email (magic link)**.
4. Copy **Project URL** + **anon public key** (safe for the browser — RLS is the boundary).
   **Never** put the `service_role` key in client code.

## 3. Auth flow
- **Sign in:** Google OAuth (one click) or email magic link. Supabase manages the session.
- **On first sign-up:** show a **ToS / Privacy consent** checkbox; on accept, insert a
  `consent` row (`consent_type='account_tos'`, current `policy_version`). Signup trigger
  auto-creates the `profiles` + `progress` rows.
- **Keep research/camera-data consent SEPARATE** (a later, explicit opt-in) — do not bundle
  it into account signup.
- **Logged-out users keep working exactly as today** (localStorage only) — zero regression.

## 4. Client adapter — `js/cloud.js`
Load supabase-js from CDN (fits the no-build architecture) as a module:
`<script type="module" src="js/cloud.js"></script>` (added after the other scripts).

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SB_URL = '<PROJECT_URL>';          // from Supabase settings
const SB_ANON = '<ANON_PUBLIC_KEY>';     // public + safe (RLS protects data)
const sb = createClient(SB_URL, SB_ANON);

window.Cloud = {
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
    this._renderAuthUI();
  },
  signInGoogle() { return sb.auth.signInWithOAuth({ provider: 'google' }); },
  signInEmail(email) { return sb.auth.signInWithOtp({ email }); },
  signOut() { return sb.auth.signOut(); },
  recordConsent(type, version, granted = true) {
    if (!this.user) return; return sb.from('consent').insert({ user_id: this.user.id, consent_type: type, policy_version: version, granted });
  },

  // ---- reads/writes (RLS scopes them to the current user) ----
  async getProfile() { const { data } = await sb.from('profiles').select('*').eq('id', this.user.id).single(); return data; },
  saveProfile(p) { return sb.from('profiles').upsert({ id: this.user.id, ...p }); },
  addWorkout(w) { return sb.from('workouts').insert({ user_id: this.user.id, ...w }); },
  async getWorkouts(limit = 50) { const { data } = await sb.from('workouts').select('*').order('created_at', { ascending: false }).limit(limit); return data || []; },
  async getProgress() { const { data } = await sb.from('progress').select('*').eq('user_id', this.user.id).single(); return data; },
  saveProgress(p) { return sb.from('progress').upsert({ user_id: this.user.id, ...p }); },

  // ---- login lifecycle ----
  async _onLogin() { await this._migrateLocalIfNeeded(); await this._hydrateLocalCache(); },

  // one-time: if the cloud is empty and this device has local data, import it
  async _migrateLocalIfNeeded() {
    const prog = await this.getProgress();
    const cloudEmpty = !prog || (prog.total_workouts === 0 && prog.xp === 0);
    const local = readLocalBundle();      // {profile, calibration, prefs, history, progress}
    if (cloudEmpty && local.hasData) {
      await this.saveProfile({ age: local.profile.age, resting_hr: local.profile.restHR, fitness_level: local.profile.fitness, calibration: local.calibration, preferences: local.prefs });
      if (local.history.length) await sb.from('workouts').insert(local.history.map(h => ({ user_id: this.user.id, ...toWorkoutRow(h) })));
      if (local.progress) await this.saveProgress({ ...toProgressRow(local.progress) });
    }
  },

  // pull cloud -> write into the SAME localStorage keys the existing UI already reads,
  // so Store/renderProgress/initProfile keep working UNCHANGED.
  async _hydrateLocalCache() {
    const [p, prog, hist] = await Promise.all([this.getProfile(), this.getProgress(), this.getWorkouts()]);
    if (p) writeLocalProfile(p);
    if (prog) localStorage.setItem('fitarcade.progress', JSON.stringify(fromProgressRow(prog)));
    if (hist) localStorage.setItem('fitarcade.history', JSON.stringify(hist.map(fromWorkoutRow)));
  },
  _renderAuthUI() { /* show signed-in badge / sign-in button in the header */ }
};
Cloud.init();
```
`readLocalBundle` / `toWorkoutRow` / `fromProgressRow` etc. are small pure mappers using the
table above.

## 5. Write-through (wiring into existing save points)
Keep `Store` + `recordWorkout` + `initProfile` as-is (localStorage stays the offline cache).
At each existing save site, **also** mirror to the cloud when signed in — one guarded line:

| Existing save site | Add |
|---|---|
| `confirmCalibration()` (app.js) | `if (window.Cloud?.user) Cloud.saveProfile({ calibration: baselines })` |
| `initProfile.apply()` (index.html) | `if (window.Cloud?.user) Cloud.saveProfile({ age, resting_hr: rest, fitness_level: fit, base_pace: basePace })` |
| `recordWorkout(stats)` (index.html) | `if (window.Cloud?.user) { Cloud.addWorkout(toWorkoutRow(stats)); Cloud.saveProgress(prog); }` |
| `setCircuitDuration` / `setRhythmMode` | `if (window.Cloud?.user) Cloud.saveProfile({ preferences: {...} })` |

Because every call is guarded by `Cloud?.user`, **logged-out play is byte-for-byte unchanged.**

## 6. Migration rules (merge)
- **First login on a device with local data + empty cloud →** import local → cloud (once).
- **Otherwise cloud is source of truth:** on login, hydrate localStorage from cloud so the
  existing UI renders the cloud data with no code changes.
- **Progress conflict** (both non-empty): keep `max(xp)`, `max(streak)`, summed lifetime
  totals — or simplest: cloud wins. Mark a `migrated` flag in localStorage to avoid re-import.

## 7. Consent, deletion & export (do these in Phase 1, not later)
- **Consent:** record account/ToS consent at signup (`consent` table) with a `policy_version`. Ship a **privacy policy + ToS** page (a generator draft + a lawyer review).
- **Export (GDPR/CCPA):** `Cloud.exportMyData()` → select all of the user's rows across tables → download JSON.
- **Delete my data:** RLS lets a user delete their own `profiles/workouts/progress` rows. **Full account (auth.users) deletion** must run server-side with the service_role — add a small **Supabase Edge Function** `delete-account` the client calls; `on delete cascade` then wipes every table. Expose a "Delete my account" button that calls it.

## 8. Security checklist
- [ ] RLS enabled on all four tables (the schema does this) — verify with the policy tester.
- [ ] Only the **anon** key in client code; `service_role` stays server-side (Edge Functions only).
- [ ] EU region if serving EU users; enable email verification; keep Supabase rate-limits on.
- [ ] Privacy policy + ToS live before launch; consent recorded per user + version.
- [ ] HTTPS everywhere (your static host already does this).

## 9. Rollout checklist
1. Create Supabase project (EU if needed) → run `schema.sql`.
2. Enable Google + email auth; copy URL + anon key into `js/cloud.js`.
3. Add `<script type="module" src="js/cloud.js"></script>` + a header sign-in button + consent checkbox.
4. Add the 4 guarded write-through lines (§5).
5. Test: sign up → local data imports → sign out/in on another device → data follows you.
6. Publish privacy policy/ToS; add export + delete-account.

---
**Scope reminder:** this phase is deliberately **numbers only**. Camera images / rPPG raw /
WiFi data are the separate, explicitly-consented, lawyer-reviewed **Phase 3** track — never
fold them into these tables.
