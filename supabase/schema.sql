-- =====================================================================
--  FIT-ARCADE — Phase 1 schema: accounts + cloud personalization
--  Target: Supabase (Postgres). Paste into the Supabase SQL editor and run.
--  Security model: Row-Level Security — every user can touch ONLY their own
--  rows. The public "anon" key is safe to ship in the browser because RLS,
--  not the key, is the boundary. NEVER expose the service_role key client-side.
-- =====================================================================

-- 1) PROFILES  (1 row per user; id == auth user id) -------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  display_name  text,
  age           int  check (age between 5 and 120),
  resting_hr    int  check (resting_hr between 30 and 120),
  fitness_level text check (fitness_level in ('beginner','intermediate','advanced')),
  base_pace     numeric(4,2),                        -- derived (cached) baseline pace
  calibration   jsonb,                               -- poseDetector baselines
  preferences   jsonb not null default '{}'::jsonb   -- {durationMin, rhythmMode, soundOn, masterVol, sfxVol}
);

-- 2) WORKOUTS  (1 row per completed session) --------------------------------
create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  program      text,
  reps         int default 0,
  score        int default 0,
  elapsed_sec  int default 0,
  calories     int default 0,
  avg_hr       int,
  peak_hr      int,
  games_played int default 0,
  xp_awarded   int default 0,
  details      jsonb                                 -- optional per-phase/per-game breakdown
);
create index if not exists workouts_user_created_idx on public.workouts (user_id, created_at desc);

-- 3) PROGRESS  (denormalized snapshot; 1 row per user) ----------------------
create table if not exists public.progress (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  updated_at      timestamptz not null default now(),
  xp              int  not null default 0,
  level           int  not null default 1,
  streak          int  not null default 0,
  last_workout_date date,
  total_workouts  int  not null default 0,
  total_reps      int  not null default 0,
  total_calories  int  not null default 0
);

-- 4) CONSENT  (append-only audit of what each user agreed to) ---------------
create table if not exists public.consent (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  consent_type   text not null,                      -- 'account_tos' | 'analytics' | 'research_media'
  granted        boolean not null,
  policy_version text not null,
  meta           jsonb
);
create index if not exists consent_user_idx on public.consent (user_id, created_at desc);

-- 5) ROW-LEVEL SECURITY ------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.progress enable row level security;
alter table public.consent  enable row level security;

-- profiles: owner == row id
create policy "profiles self read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles self insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles self delete" on public.profiles for delete using (auth.uid() = id);

-- workouts / progress: owner == user_id (full CRUD for the owner)
create policy "workouts self all" on public.workouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "progress self all" on public.progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- consent: read your own + append only (no update/delete = immutable audit trail)
create policy "consent self read"   on public.consent for select using (auth.uid() = user_id);
create policy "consent self insert" on public.consent for insert with check (auth.uid() = user_id);

-- 6) AUTO-PROVISION profile + progress on signup ---------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
    on conflict (id) do nothing;
  insert into public.progress (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) updated_at touch ------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before update on public.progress
  for each row execute function public.touch_updated_at();
