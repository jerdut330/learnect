-- LearNect: reset for the showcase.
-- Deletes every account (email and guest) and everything people did: profiles, bookings, mentor applications,
-- ratings and the sessions students published. Then puts the 9 sample sessions back to their starting seats.
-- Run it in Supabase > SQL Editor right before the booth opens. It can't be undone.
-- A phone or laptop that was signed in notices its account is gone on the next load and signs out by itself.

delete from auth.users;  -- the foreign keys remove profiles, bookings, applications, ratings and hosted sessions too
delete from public.sessions where host_id is not null;
update public.sessions set status = 'live', listed = true, week_start = null where host_id is null;

select (select count(*) from auth.users) as accounts,
       (select count(*) from public.bookings) as bookings,
       (select count(*) from public.sessions) as sessions,
       (select count(*) from public.sessions where status = 'live' and listed) as live_sample_sessions;
