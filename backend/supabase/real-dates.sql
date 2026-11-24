/* ---------- Real dates (2026-11-24) ----------
   The clock is Jakarta time. "This week" is Monday to Sunday around today. Sample sessions repeat every
   week on their weekday (week_start is null); a session a student hosts belongs to the week it was
   published in. Bookings and seat counts are per week, so seats free up again each Monday. */

create or replace function public.jkt_now() returns timestamp language sql stable as $$
  select (now() at time zone 'Asia/Jakarta')
$$;
create or replace function public.cur_week() returns date language sql stable as $$
  select date_trunc('week', public.jkt_now())::date
$$;
-- When a slot this week starts, on Jakarta's wall clock.
create or replace function public.slot_ts(p_day int, p_start text) returns timestamp language sql stable as $$
  select public.cur_week() + p_day + p_start::time
$$;

alter table public.sessions add column if not exists week_start date;
alter table public.bookings add column if not exists week_start date not null default public.cur_week();
drop index if exists public.bookings_one_active;
create unique index if not exists bookings_one_active_week on public.bookings (session_id, user_id, week_start) where status = 'booked';

drop policy if exists "visible sessions" on public.sessions;
create policy "visible sessions" on public.sessions for select using (
  (listed and status = 'live' and (week_start is null or week_start = public.cur_week()))
  or host_id = auth.uid()
  or exists (select 1 from public.bookings b where b.session_id = sessions.id and b.user_id = auth.uid())
);

create or replace function public.seat_counts() returns table (session_id text, taken int)
language sql stable security definer set search_path = public as $$
  select s.id, s.base_booked + (select count(*) from bookings b where b.session_id = s.id and b.status = 'booked' and b.week_start = cur_week())::int
  from sessions s
  where (s.listed and s.status = 'live' and (s.week_start is null or s.week_start = cur_week())) or s.host_id = auth.uid()
     or exists (select 1 from bookings b where b.session_id = s.id and b.user_id = auth.uid());
$$;

create or replace function public.book_session(p_session text) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); s sessions; n int; b bookings; wk date := cur_week();
begin
  select * into s from sessions where id = p_session for update; -- one booking at a time per session
  if not found or s.status <> 'live' or not s.listed or (s.week_start is not null and s.week_start <> wk) then
    raise exception 'This session is no longer available.';
  end if;
  if slot_ts(s.day, s.start_t) <= jkt_now() then raise exception 'This session has already started.'; end if;
  if s.host_id = uid then raise exception 'You can''t book a session you host.'; end if;
  if exists (select 1 from bookings where session_id = p_session and user_id = uid and status = 'booked' and week_start = wk) then
    raise exception 'You already have a seat in this session.';
  end if;
  select count(*) into n from bookings where session_id = p_session and status = 'booked' and week_start = wk;
  if s.base_booked + n >= s.seats then raise exception 'This session is full.'; end if;
  insert into bookings (session_id, user_id, amount, code, week_start)
  values (p_session, uid, s.price, 'LN-' || (1000 + floor(random() * 9000))::int, wk)
  returning * into b;
  return b;
end $$;

-- The refund rule: a full refund with at least 24 hours' notice, nothing later, and no cancelling once it has started.
create or replace function public.cancel_booking(p_session text) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); b bookings; s sessions; wk date := cur_week();
begin
  select * into s from sessions where id = p_session;
  if not found then raise exception 'You don''t have a booking for this session.'; end if;
  if slot_ts(s.day, s.start_t) <= jkt_now() then raise exception 'This session has already started, so it can''t be cancelled.'; end if;
  update bookings set status = 'cancelled', cancelled_at = now(),
    refunded = case when slot_ts(s.day, s.start_t) - jkt_now() >= interval '24 hours' then amount else 0 end
  where session_id = p_session and user_id = uid and status = 'booked' and week_start = wk
  returning * into b;
  if not found then raise exception 'You don''t have a booking for this session.'; end if;
  return b;
end $$;

create or replace function public.demo_approve() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); k text := substr(replace(uid::text, '-', ''), 1, 10);
begin
  update applications set status = 'approved', decided_at = now() where user_id = uid and status = 'review';
  if not found then raise exception 'There''s no application under review.'; end if;
  update profiles set role = 'approved' where id = uid;
  insert into sessions (id, course, host_id, host_name, title, day, start_t, end_t, price, seats, base_booked, format, blurb, listed, week_start)
  select 'h-arrays-' || k, 'prog', uid, p.full_name, 'Arrays & Strings Drills', 6, '19:00', '20:30', 25000, 6, 5,
         '{"type":"online","label":"Online","place":"Google Meet","detail":"Your meeting link appears in My Sessions 15 minutes before the start."}', 'Sample session for this demo.', false, cur_week()
  from profiles p where p.id = uid
  on conflict (id) do nothing;
  insert into sessions (id, course, host_id, host_name, title, day, start_t, end_t, price, seats, base_booked, format, blurb, listed, week_start)
  select 'h-debug-' || k, 'prog', uid, p.full_name, 'Debug Your First Program', 3, '16:00', '17:00', 20000, 8, 0,
         '{"type":"onsite","label":"On-site","place":"Study Room B, Anggrek Campus","detail":"Kemanggisan. Arrive 10 minutes early."}', 'Sample session for this demo.', false, cur_week()
  from profiles p where p.id = uid
  on conflict (id) do nothing;
end $$;

create or replace function public.publish_session(p_course text, p_title text, p_day int, p_start text, p_len int, p_format text, p_seats int, p_price int)
returns public.sessions
language plpgsql security definer set search_path = public as $$
declare uid uuid := me(); p profiles; a applications; st int; en int; s sessions; campus text; fmt jsonb; wk date := cur_week();
begin
  select * into p from profiles where id = uid;
  if p.role <> 'approved' then raise exception 'Only approved mentors can publish sessions.'; end if;
  select * into a from applications where user_id = uid;
  if p_course not in ('ml', 'calc', 'prog') then raise exception 'Pick a course.'; end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Give your session a title.'; end if;
  if char_length(trim(p_title)) > 40 then raise exception 'Keep the title to 40 characters.'; end if;
  if p_day < 0 or p_day > 6 then raise exception 'Pick a day this week.'; end if;
  if p_start !~ '^\d\d:[03]0$' then raise exception 'Pick a start time on the half hour.'; end if;
  if p_len not in (60, 90, 120) then raise exception 'Pick a length of 60, 90 or 120 minutes.'; end if;
  st := to_min(p_start); en := st + p_len;
  if st < 7 * 60 or en > 21 * 60 then raise exception 'Sessions run between 07:00 and 21:00.'; end if;
  if slot_ts(p_day, p_start) <= jkt_now() then raise exception 'Pick a time that hasn''t passed yet.'; end if;
  if p_seats < 4 or p_seats > 10 then raise exception 'Seats go from 4 to 10.'; end if;
  if p_price < 15000 or p_price > 50000 or p_price % 5000 <> 0 then raise exception 'Price goes from Rp15.000 to Rp50.000 in steps of Rp5.000.'; end if;
  if p_format not in ('online', 'onsite') then raise exception 'Pick online or on-site.'; end if;
  if exists (select 1 from sessions x where x.host_id = uid and x.status = 'live' and (x.week_start is null or x.week_start = wk)
             and x.day = p_day and to_min(x.start_t) < en and to_min(x.end_t) > st) then
    raise exception 'This clashes with another session you host.';
  end if;
  if exists (select 1 from bookings b join sessions x on x.id = b.session_id where b.user_id = uid and b.status = 'booked' and b.week_start = wk
             and x.day = p_day and to_min(x.start_t) < en and to_min(x.end_t) > st) then
    raise exception 'This clashes with a session you booked.';
  end if;
  campus := split_part(coalesce(a.campus, 'Kemanggisan'), ' (', 1);
  fmt := case when p_format = 'online'
    then '{"type":"online","label":"Online","place":"Google Meet","detail":"Your meeting link appears in My Sessions 15 minutes before the start."}'::jsonb
    else jsonb_build_object('type', 'onsite', 'label', 'On-site', 'place', 'Study Room, ' || campus || ' Campus', 'detail', campus || '. Arrive 10 minutes early.') end;
  insert into sessions (id, course, host_id, host_name, title, day, start_t, end_t, price, seats, format, blurb, learn, bring, week_start)
  values ('u-' || substr(md5(gen_random_uuid()::text), 1, 12), p_course, uid, p.full_name, trim(p_title), p_day, p_start,
          lpad((en / 60)::text, 2, '0') || ':' || lpad((en % 60)::text, 2, '0'), p_price, p_seats, fmt,
          'A small-group session hosted by a student mentor who passed this course.',
          '["Work through the topics in the title with a small group.", "Ask about the parts you got stuck on."]',
          '["Your lecture notes.", "Any question you got stuck on."]', wk)
  returning * into s;
  return s;
end $$;

-- A mentor cancelling refunds every student booked this week in full.
create or replace function public.cancel_hosted(p_session text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := me();
begin
  update sessions set status = 'cancelled' where id = p_session and host_id = uid and status = 'live';
  if not found then raise exception 'You don''t host this session.'; end if;
  update bookings set status = 'cancelled', refunded = amount, cancelled_at = now() where session_id = p_session and status = 'booked';
end $$;

