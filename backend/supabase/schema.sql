-- LearNect backend for Supabase: tables, access rules and the server-side rules
-- for booking, cancelling, applying, approving, hosting and rating.
-- Run setup.sql (this file plus the seed) once in Supabase > SQL Editor. It is safe to run again.
-- Payments stay simulated: nothing here talks to a payment provider.

create extension if not exists pgcrypto;

/* ---------- Tables ---------- */
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default 'LearNect student',
  major text not null default 'Computer Science',
  campus text not null default 'Kemanggisan',
  role text not null default 'none' check (role in ('none', 'review', 'approved')),
  prefs jsonb not null default '{"remind": true, "fits": true}',
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  course text not null check (course in ('ml', 'calc', 'prog')),
  mentor text,                                   -- sample mentor key from demo/js/data.js
  host_id uuid references public.profiles on delete cascade, -- set when a student hosts it
  host_name text,
  title text not null check (char_length(title) between 1 and 60),
  day int not null check (day between 0 and 6),  -- 0 = Monday of the demo week
  start_t text not null check (start_t ~ '^\d\d:\d\d$'),
  end_t text not null check (end_t ~ '^\d\d:\d\d$'),
  price int not null check (price between 0 and 1000000),
  seats int not null check (seats between 1 and 50),
  base_booked int not null default 0,            -- sample seats already taken before launch
  format jsonb not null,
  blurb text not null default '',
  learn jsonb not null default '[]',
  bring jsonb not null default '[]',
  listed boolean not null default true,          -- false = only its host sees it (demo sample)
  status text not null default 'live' check (status in ('live', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.sessions on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  amount int not null,
  refunded int not null default 0,
  code text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
-- The one-seat-per-person index is per week; real-dates.sql creates it.
create index if not exists bookings_by_session on public.bookings (session_id) where status = 'booked';

create table if not exists public.applications (
  user_id uuid primary key references public.profiles on delete cascade,
  campus text not null,
  courses text[] not null,
  gpa numeric(3, 2) not null check (gpa between 0 and 4),
  transcript boolean not null,
  why text not null,
  format text not null check (format in ('online', 'onsite', 'both')),
  status text not null default 'review' check (status in ('review', 'approved')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.ratings (
  user_id uuid not null references public.profiles on delete cascade,
  past_id text not null,
  stars int not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  primary key (user_id, past_id)
);

/* ---------- A profile for every new account (email or guest) ---------- */
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                           case when new.is_anonymous then 'Guest' else 'LearNect student' end))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.me() returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  insert into profiles (id) values (uid) on conflict (id) do nothing;
  return uid;
end $$;

/* ---------- Access rules: read your own rows; every write goes through the functions below ---------- */
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.applications enable row level security;
alter table public.ratings enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id = auth.uid());

drop policy if exists "own bookings" on public.bookings;
create policy "own bookings" on public.bookings for select using (user_id = auth.uid());

drop policy if exists "visible sessions" on public.sessions;
create policy "visible sessions" on public.sessions for select using (
  (listed and status = 'live')
  or host_id = auth.uid()
  or exists (select 1 from public.bookings b where b.session_id = sessions.id and b.user_id = auth.uid())
);

drop policy if exists "own application" on public.applications;
create policy "own application" on public.applications for select using (user_id = auth.uid());

drop policy if exists "own ratings" on public.ratings;
create policy "own ratings" on public.ratings for select using (user_id = auth.uid());

revoke insert, update, delete on public.profiles, public.sessions, public.bookings, public.applications, public.ratings from anon, authenticated;
grant select on public.profiles, public.sessions, public.bookings, public.applications, public.ratings to anon, authenticated;

/* ---------- Seats taken, shared by every visitor ---------- */
create or replace function public.seat_counts() returns table (session_id text, taken int)
language sql stable security definer set search_path = public as $$
  select s.id, s.base_booked + (select count(*) from bookings b where b.session_id = s.id and b.status = 'booked')::int
  from sessions s
  where (s.listed and s.status = 'live') or s.host_id = auth.uid()
     or exists (select 1 from bookings b where b.session_id = s.id and b.user_id = auth.uid());
$$;

/* ---------- Booking ---------- */
create or replace function public.book_session(p_session text) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); s sessions; n int; b bookings;
begin
  select * into s from sessions where id = p_session for update; -- one booking at a time per session
  if not found or s.status <> 'live' or not s.listed then raise exception 'This session is no longer available.'; end if;
  if s.host_id = uid then raise exception 'You can''t book a session you host.'; end if;
  if exists (select 1 from bookings where session_id = p_session and user_id = uid and status = 'booked') then
    raise exception 'You already have a seat in this session.';
  end if;
  select count(*) into n from bookings where session_id = p_session and status = 'booked';
  if s.base_booked + n >= s.seats then raise exception 'This session is full.'; end if;
  insert into bookings (session_id, user_id, amount, code)
  values (p_session, uid, s.price, 'LN-' || (1000 + floor(random() * 9000))::int)
  returning * into b;
  return b;
end $$;

-- The demo week is before the 24-hour cut-off, so a learner's cancellation is always a full refund.
create or replace function public.cancel_booking(p_session text) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); b bookings;
begin
  update bookings set status = 'cancelled', refunded = amount, cancelled_at = now()
  where session_id = p_session and user_id = uid and status = 'booked'
  returning * into b;
  if not found then raise exception 'You don''t have a booking for this session.'; end if;
  return b;
end $$;

/* ---------- Becoming a mentor ---------- */
create or replace function public.submit_application(p_campus text, p_courses text[], p_gpa numeric, p_transcript boolean, p_why text, p_format text)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); a applications;
begin
  if exists (select 1 from applications where user_id = uid) then raise exception 'You''ve already applied.'; end if;
  if p_campus not in ('Kemanggisan (Anggrek & Syahdan)', 'Alam Sutera', 'Bekasi', 'Senayan') then raise exception 'Pick a campus.'; end if;
  if coalesce(array_length(p_courses, 1), 0) = 0 or not (p_courses <@ array['ml', 'calc', 'prog']) then raise exception 'Pick at least one course.'; end if;
  if p_gpa is null or p_gpa < 0 or p_gpa > 4 then raise exception 'Write your GPA as a number from 0 to 4, like 3.72.'; end if;
  if not p_transcript then raise exception 'Attach your transcript so we can check your grades.'; end if;
  if coalesce(array_length(regexp_split_to_array(trim(p_why), '\s+'), 1), 0) < 20 then raise exception 'Write at least 20 words about how you would teach.'; end if;
  if char_length(p_why) > 3000 then raise exception 'Keep your answer under 3000 characters.'; end if;
  if p_format not in ('online', 'onsite', 'both') then raise exception 'Pick a format.'; end if;
  insert into applications (user_id, campus, courses, gpa, transcript, why, format)
  values (uid, p_campus, p_courses, p_gpa, p_transcript, trim(p_why), p_format) returning * into a;
  update profiles set role = 'review' where id = uid;
  return a;
end $$;

-- Showcase control: the visitor approves their own application, as the "Demo control" box says.
-- Approval also adds two sample sessions that only this mentor sees, so Host and Earnings have something in them.
create or replace function public.demo_approve() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); k text := substr(replace(uid::text, '-', ''), 1, 10);
begin
  update applications set status = 'approved', decided_at = now() where user_id = uid and status = 'review';
  if not found then raise exception 'There''s no application under review.'; end if;
  update profiles set role = 'approved' where id = uid;
  insert into sessions (id, course, host_id, host_name, title, day, start_t, end_t, price, seats, base_booked, format, blurb, listed)
  select 'h-arrays-' || k, 'prog', uid, p.full_name, 'Arrays & Strings Drills', 6, '19:00', '20:30', 25000, 6, 5,
         '{"type":"online","label":"Online","place":"Google Meet","detail":"Your meeting link appears in My Sessions 15 minutes before the start."}', 'Sample session for this demo.', false
  from profiles p where p.id = uid
  on conflict (id) do nothing;
  insert into sessions (id, course, host_id, host_name, title, day, start_t, end_t, price, seats, base_booked, format, blurb, listed)
  select 'h-debug-' || k, 'prog', uid, p.full_name, 'Debug Your First Program', 3, '16:00', '17:00', 20000, 8, 0,
         '{"type":"onsite","label":"On-site","place":"Study Room B, Anggrek Campus","detail":"Kemanggisan. Arrive 10 minutes early."}', 'Sample session for this demo.', false
  from profiles p where p.id = uid
  on conflict (id) do nothing;
end $$;

/* ---------- Hosting ---------- */
create or replace function public.to_min(t text) returns int language sql immutable as $$
  select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int
$$;

create or replace function public.publish_session(p_course text, p_title text, p_day int, p_start text, p_len int, p_format text, p_seats int, p_price int)
returns public.sessions
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); p profiles; a applications; st int; en int; s sessions; campus text; fmt jsonb;
begin
  select * into p from profiles where id = uid;
  if p.role <> 'approved' then raise exception 'Only approved mentors can publish sessions.'; end if;
  select * into a from applications where user_id = uid;
  if p_course not in ('ml', 'calc', 'prog') then raise exception 'Pick a course.'; end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Give your session a title.'; end if;
  if char_length(trim(p_title)) > 40 then raise exception 'Keep the title to 40 characters.'; end if;
  if p_day < 3 or p_day > 6 then raise exception 'Pick a day after today.'; end if;
  if p_start !~ '^\d\d:[03]0$' then raise exception 'Pick a start time on the half hour.'; end if;
  if p_len not in (60, 90, 120) then raise exception 'Pick a length of 60, 90 or 120 minutes.'; end if;
  st := to_min(p_start); en := st + p_len;
  if st < 7 * 60 or en > 21 * 60 then raise exception 'Sessions run between 07:00 and 21:00.'; end if;
  if p_seats < 4 or p_seats > 10 then raise exception 'Seats go from 4 to 10.'; end if;
  if p_price < 15000 or p_price > 50000 or p_price % 5000 <> 0 then raise exception 'Price goes from Rp15.000 to Rp50.000 in steps of Rp5.000.'; end if;
  if p_format not in ('online', 'onsite') then raise exception 'Pick online or on-site.'; end if;
  if exists (select 1 from sessions x where x.host_id = uid and x.status = 'live' and x.day = p_day and to_min(x.start_t) < en and to_min(x.end_t) > st) then
    raise exception 'This clashes with another session you host.';
  end if;
  if exists (select 1 from bookings b join sessions x on x.id = b.session_id where b.user_id = uid and b.status = 'booked' and x.day = p_day and to_min(x.start_t) < en and to_min(x.end_t) > st) then
    raise exception 'This clashes with a session you booked.';
  end if;
  campus := split_part(coalesce(a.campus, 'Kemanggisan'), ' (', 1);
  fmt := case when p_format = 'online'
    then '{"type":"online","label":"Online","place":"Google Meet","detail":"Your meeting link appears in My Sessions 15 minutes before the start."}'::jsonb
    else jsonb_build_object('type', 'onsite', 'label', 'On-site', 'place', 'Study Room, ' || campus || ' Campus', 'detail', campus || '. Arrive 10 minutes early.') end;
  insert into sessions (id, course, host_id, host_name, title, day, start_t, end_t, price, seats, format, blurb, learn, bring)
  values ('u-' || substr(md5(gen_random_uuid()::text), 1, 12), p_course, uid, p.full_name, trim(p_title), p_day, p_start,
          lpad((en / 60)::text, 2, '0') || ':' || lpad((en % 60)::text, 2, '0'), p_price, p_seats, fmt,
          'A small-group session hosted by a student mentor who passed this course.',
          '["Work through the topics in the title with a small group.", "Ask about the parts you got stuck on."]',
          '["Your lecture notes.", "Any question you got stuck on."]')
  returning * into s;
  return s;
end $$;

-- A mentor cancelling refunds every booked student in full.
create or replace function public.cancel_hosted(p_session text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := me();
begin
  update sessions set status = 'cancelled' where id = p_session and host_id = uid and status = 'live';
  if not found then raise exception 'You don''t host this session.'; end if;
  update bookings set status = 'cancelled', refunded = amount, cancelled_at = now() where session_id = p_session and status = 'booked';
end $$;

/* ---------- Ratings and preferences ---------- */
create or replace function public.rate_session(p_past text, p_stars int, p_tags text[], p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := me();
begin
  if p_past not in ('basics') then raise exception 'There''s no finished session to rate.'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'Pick a star rating.'; end if;
  insert into ratings (user_id, past_id, stars, tags, note) values (uid, p_past, p_stars, coalesce(p_tags, '{}'), left(coalesce(p_note, ''), 1000))
  on conflict (user_id, past_id) do nothing;
  if not found then raise exception 'You''ve already rated this session.'; end if;
end $$;

create or replace function public.set_prefs(p_prefs jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := me();
begin
  update profiles set prefs = jsonb_build_object('remind', coalesce((p_prefs ->> 'remind')::boolean, true), 'fits', coalesce((p_prefs ->> 'fits')::boolean, true)) where id = uid;
end $$;

/* ---------- Who may call what ---------- */
revoke execute on function public.me(), public.book_session(text), public.cancel_booking(text),
  public.submit_application(text, text[], numeric, boolean, text, text), public.demo_approve(),
  public.publish_session(text, text, int, text, int, text, int, int), public.cancel_hosted(text),
  public.rate_session(text, int, text[], text), public.set_prefs(jsonb), public.handle_new_user() from public, anon;
grant execute on function public.book_session(text), public.cancel_booking(text),
  public.submit_application(text, text[], numeric, boolean, text, text), public.demo_approve(),
  public.publish_session(text, text, int, text, int, text, int, int), public.cancel_hosted(text),
  public.rate_session(text, int, text[], text), public.set_prefs(jsonb) to authenticated;
grant execute on function public.seat_counts() to anon, authenticated;
