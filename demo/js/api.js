/* LearNect backend client, shared with website/app/api.js (keep the two copies the same). Talks to Supabase (auth, tables, and the rule-checking functions in
   backend/supabase/schema.sql). window.LN_API stays null when no backend is configured, and app.js
   then runs the offline demo exactly as before. */
window.LN_API = (function () {
  'use strict';
  var cfg = window.LN_CONFIG || {};
  if (!cfg.url || !cfg.key || !window.supabase || !window.supabase.createClient) return null;

  var sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'learnect-auth' } });
  var api = { user: null, profile: null, onAuth: null };

  function fail(err) {
    var m = (err && (err.message || err.error_description)) || 'Something went wrong. Try again.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = 'Can’t reach LearNect right now. Check your connection and try again.';
    if (/Invalid login credentials/i.test(m)) m = 'That email and password don’t match an account.';
    if (/User already registered/i.test(m)) m = 'There’s already an account with this email. Sign in instead.';
    if (/Anonymous sign-ins are disabled/i.test(m)) m = 'Guest access is turned off. Create an account instead.';
    if (/Password should be at least/i.test(m)) m = 'Use a password of at least 6 characters.';
    if (/Email not confirmed/i.test(m)) m = 'Confirm your email first, using the link we sent you.';
    var e = new Error(m); e.cause = err; throw e;
  }
  function ok(res) { if (res.error) fail(res.error); return res.data; }
  function rpc(name, args) { return sb.rpc(name, args || {}).then(ok); }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
  }

  api.init = function () {
    return withTimeout(sb.auth.getSession(), 8000).then(function (res) {
      api.user = res.data && res.data.session ? res.data.session.user : null;
      sb.auth.onAuthStateChange(function (ev, session) {
        var next = session ? session.user : null;
        var changed = (next && next.id) !== (api.user && api.user.id);
        api.user = next;
        if (changed && api.onAuth) api.onAuth(ev);
      });
      return api.user;
    });
  };

  /* ---------- Accounts ---------- */
  api.signIn = function (email, password) { return sb.auth.signInWithPassword({ email: email, password: password }).then(ok).then(function (d) { api.user = d.user; return d; }); };
  api.signUp = function (name, email, password) {
    return sb.auth.signUp({ email: email, password: password, options: { data: { full_name: name }, emailRedirectTo: location.href.split('#')[0] } }).then(ok)
      .then(function (d) { if (d.session) api.user = d.user; return { needsConfirm: !d.session }; });
  };
  api.guest = function () { return sb.auth.signInAnonymously().then(ok).then(function (d) { api.user = d.user; return d; }); };
  api.signOut = function () { api.user = null; api.profile = null; return sb.auth.signOut().catch(function () {}); };

  /* ---------- Reading everything the site needs in one go ---------- */
  api.load = function () {
    var uid = api.user && api.user.id;
    var jobs = [
      sb.from('sessions').select('*').then(ok),
      rpc('seat_counts'),
      uid ? sb.from('profiles').select('*').eq('id', uid).maybeSingle().then(ok) : null,
      uid ? sb.from('bookings').select('*').eq('user_id', uid).order('created_at').then(ok) : [],
      uid ? sb.from('applications').select('*').eq('user_id', uid).maybeSingle().then(ok) : null,
      uid ? sb.from('ratings').select('*').eq('user_id', uid).then(ok) : []
    ];
    return Promise.all(jobs).then(function (r) {
      api.profile = r[2];
      var counts = {}; (r[1] || []).forEach(function (c) { counts[c.session_id] = c.taken; });
      return { sessions: r[0] || [], counts: counts, profile: r[2], bookings: r[3] || [], application: r[4], ratings: r[5] || [] };
    });
  };

  /* ---------- Actions (each one is checked again on the server) ---------- */
  api.book = function (id) { return rpc('book_session', { p_session: id }); };
  api.cancel = function (id) { return rpc('cancel_booking', { p_session: id }); };
  api.apply = function (a) {
    return rpc('submit_application', { p_campus: a.campus, p_courses: a.courses, p_gpa: parseFloat(String(a.gpa).replace(',', '.')), p_transcript: !!a.transcript, p_why: a.why, p_format: a.format });
  };
  api.approve = function () { return rpc('demo_approve'); };
  api.publish = function (n) {
    return rpc('publish_session', { p_course: n.course, p_title: n.title, p_day: n.day, p_start: n.start, p_len: n.len, p_format: n.format, p_seats: n.seats, p_price: n.price });
  };
  api.cancelHosted = function (id) { return rpc('cancel_hosted', { p_session: id }); };
  api.rate = function (id, r) { return rpc('rate_session', { p_past: id, p_stars: r.stars, p_tags: r.tags, p_note: r.note }); };
  api.prefs = function (p) { return rpc('set_prefs', { p_prefs: p }); };

  return api;
})();
