/* LearNect website. Every task sits beside your real week. Vanilla JS, hash routes, shared sample data. */
(function () {
  'use strict';

  var D = window.LN_DATA;
  var paneEl = document.getElementById('pane'), weekEl = document.getElementById('timetable'), navEl = document.getElementById('nav'), dlg = document.getElementById('dlg');
  var START = 7 * 60, END = 21 * 60;
  var SHORT = { regression: 'Regression', derivatives: 'Derivatives', python: 'Python Loops', limits: 'Limits', trees: 'Decision Trees', sql: 'SQL Joins', recursion: 'Recursion', integrals: 'Integrals', neural: 'Neural Nets' };

  /* ---------- State (per tab, survives refresh; Reset demo clears it between visitors) ---------- */
  var KEY = 'learnect-web-v1';
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function fresh() {
    return { booked: {}, cancelled: {}, pick: 'regression', course: 'all', format: 'all', fits: true, q: '', mytab: 'upcoming', lastBooked: null,
      role: 'none', hostTab: 'upcoming', hosted: [], ratings: {}, prefs: { remind: true, fits: true }, app: clone(D.applySeed), nw: clone(D.newSessionSeed) };
  }
  var state = (function () {
    try { var s = JSON.parse(sessionStorage.getItem(KEY)); if (s && s.booked) return s; } catch (e) {}
    return fresh();
  })();
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Backend (Supabase, see api.js). With no backend configured, everything stays in this tab. ---------- */
  var API = window.LN_API, EXTRA = [], CODES = {}, busy = false, SAMPLE = D.sessions.slice();
  function signedIn() { return !!(API && API.user); }
  function me() {
    if (!API) return D.user;
    var p = API.profile || {}, guest = !!(API.user && API.user.is_anonymous);
    var full = p.full_name || (guest ? 'Guest' : 'LearNect student');
    return { full: full, name: full.split(' ')[0], major: p.major || 'Computer Science', campus: p.campus || 'Kemanggisan', guest: guest };
  }
  // Bookings, applications, hosting and ratings belong to the account, so never trust a copy left in the tab.
  function clearServerState() {
    state.booked = {}; state.cancelled = {}; state.role = 'none'; state.hosted = []; CODES = {};
    Object.keys(state.ratings).forEach(function (k) { if (state.ratings[k].sent) delete state.ratings[k]; });
  }
  function fromRow(r, counts, mine) {
    var taken = counts.hasOwnProperty(r.id) ? counts[r.id] : r.base_booked, mentor = r.mentor;
    if (!mentor || !D.mentors[mentor]) {
      var full = r.host_name || 'Student mentor';
      mentor = 'u:' + r.host_id;
      D.mentors[mentor] = { id: mentor, name: full.split(' ')[0], full: full, major: 'Student mentor', rating: null, sessions: 0, initial: full.charAt(0).toUpperCase(), quote: '' };
    }
    return { id: r.id, course: r.course, mentor: mentor, day: r.day, start: r.start_t, end: r.end_t, price: r.price, seats: r.seats,
      booked: Math.max(0, taken - (mine ? 1 : 0)), title: r.title, format: r.format, blurb: r.blurb, learn: r.learn || [], bring: r.bring || [] };
  }
  function applyServer(d) {
    var uid = API.user && API.user.id, mine = {}, list = [], extra = [], hostedList = [];
    clearServerState();
    var week = d.bookings.filter(function (b) { return b.week_start === D.WEEK_START; });
    state.refunds = {};
    week.forEach(function (b) { if (b.status === 'booked') { state.booked[b.session_id] = true; mine[b.session_id] = true; CODES[b.session_id] = b.code; } });
    week.forEach(function (b) { if (b.status === 'cancelled' && !mine[b.session_id]) { state.cancelled[b.session_id] = true; state.refunds[b.session_id] = b.refunded; } });
    d.sessions.forEach(function (r) {
      if (r.week_start && r.week_start !== D.WEEK_START) return; // a hosted session from another week
      if (uid && r.host_id === uid) {
        if (r.status === 'live') hostedList.push({ id: r.id, course: r.course, title: r.title, day: r.day, start: r.start_t, end: r.end_t, price: r.price, seats: r.seats,
          booked: d.counts.hasOwnProperty(r.id) ? d.counts[r.id] : r.base_booked, type: r.format.type, place: r.format.place });
        return;
      }
      (r.listed && r.status === 'live' ? list : extra).push(fromRow(r, d.counts, mine[r.id]));
    });
    D.sessions = list; EXTRA = extra; state.hosted = hostedList;
    state.role = d.profile ? d.profile.role : 'none';
    if (d.profile && d.profile.prefs) state.prefs = d.profile.prefs;
    if (d.application) { var a = d.application; state.app = { campus: a.campus, courses: a.courses, gpa: String(a.gpa), transcript: a.transcript, why: a.why, format: a.format, confirm: true }; }
    d.ratings.forEach(function (r) { state.ratings[r.past_id] = { stars: r.stars, tags: r.tags, note: r.note, sent: true }; });
    if (!S(state.pick) && D.sessions.length) state.pick = D.sessions[0].id;
    save();
  }
  // Pull the latest from the server. Quiet syncs only redraw what can't disturb someone mid-task.
  function sync(quiet) {
    if (!API) return Promise.resolve();
    return API.load().then(function (d) { applyServer(d); quiet ? softRefresh() : render({ keep: true }); });
  }
  function softRefresh() {
    var a = document.activeElement, typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== 'q';
    if (busy || dlg.open || typing) return;
    if (current.name === 'week') { refreshFilters(); navEl.innerHTML = navHtml(); }
    else if (['s', 'sessions', 'host', 'earnings', 'manage', 'notifications', 'profile'].indexOf(current.name) >= 0) render({ keep: true });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function working(btn, label) { busy = true; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + esc(label); } }
  function notice(title, msg) {
    busy = false;
    dlg.innerHTML = '<h2 id="dlg-title">' + esc(title) + '</h2><p>' + esc(msg) + '</p><div class="dlg-a"><button class="btn primary" type="button" data-act="dlg-close">OK</button></div>';
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('[data-act="dlg-close"]').focus();
  }
  function failed(title) {
    return function (e) { notice(title, e.message); sync(true).catch(function () {}); render({ keep: true }); };
  }

  /* ---------- Helpers ---------- */
  var DAY_S = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_L = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var weekStart = new Date(D.WEEK_START + 'T00:00:00');
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mins(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(m) { var h = Math.floor(m / 60), x = m % 60; return (h < 10 ? '0' : '') + h + ':' + (x < 10 ? '0' : '') + x; }
  function dateOf(d) { var x = new Date(weekStart); x.setDate(x.getDate() + d); return x; }
  function dayNum(d) { return dateOf(d).getDate(); }
  function longDate(d) { var x = dateOf(d); return DAY_L[d] + ' ' + x.getDate() + ' ' + MON[x.getMonth()]; }
  function shortDate(d) { var x = dateOf(d); return DAY_S[d] + ' ' + x.getDate() + ' ' + MON[x.getMonth()]; }
  function rp(n) { return 'Rp' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function rpShort(n) { return 'Rp' + Math.round(n / 1000) + 'k'; }
  function all() { return D.sessions.concat(EXTRA); }
  function S(id) { var l = all(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function C(s) { return D.courses[s.course]; }
  function M(s) { return D.mentors[s.mentor]; }
  function isBooked(s) { return !!state.booked[s.id]; }
  function taken(s) { return s.booked + (isBooked(s) ? 1 : 0); }
  function left(s) { return Math.max(0, s.seats - taken(s)); }
  // Real dates: a session that has already started this week can't be booked any more.
  function ended(s) { return D.isPast(s.day, s.start); }
  function isFull(s) { return (left(s) === 0 || ended(s)) && !isBooked(s); }
  function refundOf(s) { var r = (state.refunds || {})[s.id]; return r == null ? s.price : r; }
  function tone(s) { return isBooked(s) ? 'sun' : isFull(s) ? 'full' : C(s).colour; }
  function byTime(a, b) { return a.day - b.day || mins(a.start) - mins(b.start); }
  function classesOn(day) {
    var list = D.classes.filter(function (c) { return c.day === day; });
    if (state.role === 'approved') state.hosted.forEach(function (h) {
      if (h.day === day) list.push({ day: h.day, start: h.start, end: h.end, course: h.course, room: h.type === 'online' ? 'Online' : h.place.split(',')[0], title: h.title, teaching: true, hostId: h.id });
    });
    return list;
  }
  function clashOf(s) {
    var a = mins(s.start), b = mins(s.end), hit = null;
    classesOn(s.day).forEach(function (c) { if (mins(c.start) < b && mins(c.end) > a) hit = c; });
    return hit;
  }
  function freeGaps(day) {
    var cur = START, out = [];
    var busy = classesOn(day).map(function (c) { return [mins(c.start), mins(c.end)]; })
      .concat(D.sessions.filter(function (s) { return s.day === day && isBooked(s); }).map(function (s) { return [mins(s.start), mins(s.end)]; }))
      .sort(function (a, b) { return a[0] - b[0]; });
    busy.forEach(function (c) { if (c[0] > cur) out.push([cur, c[0]]); cur = Math.max(cur, c[1]); });
    if (cur < END) out.push([cur, END]);
    return out;
  }
  function bookingCode(s) { if (CODES[s.id]) return CODES[s.id]; var h = 0; for (var i = 0; i < s.id.length; i++) h = (h * 31 + s.id.charCodeAt(i)) % 9000; return 'LN-' + (1000 + h); }
  function cellsHtml(n, total) { var o = '<span class="cells" aria-hidden="true">'; for (var i = 0; i < total; i++) o += '<i' + (i < n ? ' class="f"' : '') + '></i>'; return o + '</span>'; }
  function seatsText(s) { if (isBooked(s)) return 'You have a seat'; if (ended(s)) return 'This session has started'; var l = left(s); return l === 0 ? 'Full' : l + ' of ' + s.seats + ' seats left'; }
  function fitText(s) {
    var cls = classesOn(s.day), a = mins(s.start), before = null, after = null;
    cls.forEach(function (c) {
      if (mins(c.end) <= a && (!before || mins(c.end) > mins(before.end))) before = c;
      if (mins(c.start) >= mins(s.end) && (!after || mins(c.start) < mins(after.start))) after = c;
    });
    if (!cls.length) return 'Fits your free time on ' + DAY_L[s.day] + '. You have no classes that day.';
    var t = 'Fits your free time on ' + DAY_L[s.day];
    if (before) t += ', after your class ends at ' + before.end;
    if (after) t += (before ? ' and ' : ', ') + 'before your ' + after.start + ' class';
    return t + '.';
  }
  function fitShort(s) {
    var before = null;
    classesOn(s.day).forEach(function (c) { if (mins(c.end) <= mins(s.start) && (!before || mins(c.end) > mins(before.end))) before = c; });
    return before ? 'Fits your free time after ' + before.end + '.' : 'Fits your free time.';
  }
  function share(n) { return Math.round(n * (1 - D.commission)); }
  function hosted(id) { for (var i = 0; i < state.hosted.length; i++) if (state.hosted[i].id === id) return state.hosted[i]; return null; }
  function liveHosted() { return state.hosted.slice().sort(byTime); }
  function projected() { return liveHosted().reduce(function (t, h) { return t + share(h.booked * h.price); }, 0); }
  function words(s) { return String(s).trim().split(/\s+/).filter(Boolean).length; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function ic(name, attrs) {
    var p = {
      search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
      cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      back: '<path d="M15 5l-7 7 7 7"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
      pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
      video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
      gap: '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3"/><path d="M9 12h6M12 9v6"/>',
      warn: '<path d="M12 3l9.5 17H2.5z"/><path d="M12 10v4M12 17v.5"/>',
      minus: '<path d="M5 12h14"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'
    }[name];
    return '<svg ' + (attrs || '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ---------- Routes ---------- */
  var ROUTES = { week: 'week', s: 'week', pay: 'week', qris: 'week', done: 'week', sessions: 'sessions', rate: 'sessions', host: 'host', apply: 'host', applied: 'host', new: 'host', manage: 'host', earnings: 'earnings', notifications: 'notifications', help: 'help', profile: 'profile', signin: 'profile' };
  // Pages that belong to an account. Signed-out visitors can still browse the week and session details.
  var PRIVATE = { pay: 1, qris: 1, done: 1, sessions: 1, rate: 1, apply: 1, applied: 1, new: 1, manage: 1, earnings: 1, notifications: 1, profile: 1 };
  function parse() {
    var h = (location.hash || '#week').slice(1).split('/');
    return { name: ROUTES.hasOwnProperty(h[0]) ? h[0] : 'week', id: h[1] };
  }
  var current = parse();
  function narrow() { return window.matchMedia('(max-width: 960px)').matches; }
  function inBooking() { return ['s', 'pay', 'qris', 'done'].indexOf(current.name) >= 0; }

  /* ---------- Session list and filters ---------- */
  function matches(s) {
    var q = state.q.trim().toLowerCase();
    if (state.course !== 'all' && s.course !== state.course) return false;
    if (state.format !== 'all' && s.format.type !== state.format) return false;
    if (q && (s.title + ' ' + C(s).name + ' ' + C(s).code + ' ' + M(s).name).toLowerCase().indexOf(q) < 0) return false;
    if (state.fits && !isBooked(s) && (clashOf(s) || isFull(s))) return false;
    return true;
  }
  function listed() { return D.sessions.filter(matches).sort(byTime); }
  function rowHtml(s) {
    var clash = clashOf(s), right = isBooked(s) ? 'Booked' : isFull(s) ? (ended(s) ? 'Started' : 'Full') : rpShort(s.price) + '<br>' + left(s) + ' left';
    var place = s.format.type === 'online' ? 'Online' : s.format.place.split(',')[1].trim();
    var meta = C(s).name + ' · ' + M(s).name + ' · ' + place;
    if (clash && !isBooked(s)) meta = 'Clashes with your ' + clash.start + ' class';
    return '<button type="button" class="row ' + tone(s) + '" data-act="pick" data-id="' + s.id + '" data-sid="' + s.id + '" aria-pressed="' + (state.pick === s.id) + '">' +
      '<span class="tm">' + s.start + '<small>' + DAY_S[s.day] + ' ' + dayNum(s.day) + '</small></span>' +
      '<span><h3>' + esc(s.title) + '</h3><p>' + esc(meta) + '</p></span><em>' + right + '</em></button>';
  }
  function resultsHtml() {
    var list = listed();
    if (!list.length) return '<div class="empty"><b>No sessions match</b><p>' + (state.q.trim() ? 'Nothing for “' + esc(state.q) + '” with these filters.' : 'Nothing with these filters this week.') + '</p><button class="btn secondary" type="button" data-act="clear">Clear filters</button></div>';
    return list.map(rowHtml).join('');
  }
  function weekPane() {
    var chips = [['all', 'All', null]].concat(Object.keys(D.courses).map(function (k) { return [k, D.courses[k].name, D.courses[k].colour]; }));
    return screen(head('Find a session'),
      '<div class="filters"><label class="search"><span class="vh">Search sessions</span>' + ic('search') + '<input id="q" type="search" placeholder="Course, topic or mentor" value="' + esc(state.q) + '" autocomplete="off"></label>' +
      '<div class="chips" role="group" aria-label="Course">' + chips.map(function (c) {
        return '<button type="button" class="chip" aria-pressed="' + (state.course === c[0]) + '" data-act="course" data-v="' + c[0] + '">' + (c[2] ? '<i style="background:var(--' + c[2] + ')"></i>' : '') + esc(c[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="filter-row"><div class="seg" role="group" aria-label="Format">' + [['all', 'All'], ['online', 'Online'], ['onsite', 'On-site']].map(function (f) {
        return '<button type="button" aria-pressed="' + (state.format === f[0]) + '" data-act="format" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div><label class="switch"><span>Fits my week</span><input type="checkbox" role="switch" id="fits"' + (state.fits ? ' checked' : '') + '><i aria-hidden="true"></i></label></div></div>' +
      '<div class="rows" id="results">' + resultsHtml() + '</div>');
  }

  /* ---------- Pane scaffolding ---------- */
  function head(title, back, right) {
    return '<header class="p-head">' + (back ? '<a class="back" href="' + back + '" aria-label="Back">' + ic('back') + '</a>' : '') + '<h1 tabindex="-1">' + esc(title) + '</h1>' + (right || '') + '</header>';
  }
  function screen(h, body, foot) {
    return '<div class="p-scroll">' + h + '<div class="p-body">' + body + '</div></div>' + (foot ? '<div class="p-foot">' + foot + '</div>' : '');
  }
  function band(s) {
    var col = tone(s) === 'full' ? C(s).colour : tone(s);
    return '<div class="band ' + col + '"><div class="tm">' + s.start + '<span>' + s.end + '</span></div><div><div class="t">' + esc(s.title) + '</div><div class="m">' + longDate(s.day) + '</div><div class="m">' + esc((isBooked(s) ? 'Booked · ' : '') + C(s).name + ' · ' + s.format.label + ' · ' + M(s).name) + '</div></div></div>';
  }
  function notFound() { return screen(head('Not found', '#week'), '<div class="empty"><b>That page doesn’t exist</b><p>It may have been removed.</p><a class="btn primary" href="#week">Back to your week</a></div>'); }

  /* ---------- Booking ---------- */
  function details(id) {
    var s = S(id); if (!s) return notFound();
    var m = M(s), clash = clashOf(s), action;
    var fit = isBooked(s) ? '<div class="fit mine">' + ic('check') + '<span>You’re booked. It’s in your week and in My Sessions.</span></div>'
      : clash ? '<div class="fit clash">' + ic('warn') + '<span>Clashes with your class <b>' + esc(clash.title) + '</b> (' + clash.start + '–' + clash.end + ').</span></div>'
      : '<div class="fit">' + ic('gap') + '<span>' + fitText(s) + '</span></div>';
    if (isBooked(s)) action = '<a class="btn primary" href="#sessions">View in My Sessions</a>';
    else if (isFull(s)) action = '<button class="btn" type="button" disabled>' + (ended(s) ? 'Session has started' : 'Session full') + '</button>';
    else action = '<a class="btn primary" href="#pay/' + s.id + '">Book session</a>';
    return screen(head('Session', '#week'), band(s) + '<p>' + esc(s.blurb) + '</p><div class="seats">' + cellsHtml(taken(s), s.seats) + '<span>' + seatsText(s) + '</span></div>' + fit +
      '<h2 class="sec">Where</h2><div class="card place"><span class="ic">' + ic(s.format.type === 'online' ? 'video' : 'pin') + '</span><div><b>' + esc(s.format.place) + '</b><p>' + esc(s.format.detail) + '</p></div></div>' +
      '<h2 class="sec">Your mentor</h2><div class="card"><div class="mentor"><span class="avatar" aria-hidden="true">' + m.initial + '</span><div><b>' + esc(m.full) + '</b><div class="meta">Peer mentor · ' + esc(m.major) + '</div><div class="meta num">' + (m.rating ? ic('star') + ' ' + m.rating.toFixed(1) + ' · ' + m.sessions + ' sessions taught' : 'New mentor on LearNect') + '</div></div></div>' + (m.quote ? '<p class="quote">“' + esc(m.quote) + '”</p>' : '') + '</div>' +
      '<h2 class="sec">What you’ll learn</h2><ul class="checks">' + s.learn.map(function (l) { return '<li><span class="box">' + ic('check') + '</span>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<h2 class="sec">Come prepared</h2><ul class="checks plain">' + s.bring.map(function (l) { return '<li><span class="box"></span>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<h2 class="sec">Before you book</h2><div class="note">' + ic('info') + '<span>' + esc(D.refundRule) + '</span></div>',
      '<div class="price"><b>' + rp(s.price) + '</b><span>per person</span></div>' + action);
  }
  function pay(id) {
    var s = S(id); if (!s) return notFound();
    if (isBooked(s)) { location.replace('#done/' + s.id); return ''; }
    if (isFull(s)) { location.replace('#s/' + s.id); return ''; }
    return screen(head('Review & pay', '#s/' + s.id), band(s) +
      '<h2 class="sec">Price</h2><div class="card"><div class="line"><span class="k">Session, 1 seat</span><span>' + rp(s.price) + '</span></div><div class="line total"><span>Total</span><span>' + rp(s.price) + '</span></div></div>' +
      '<h2 class="sec">Pay with</h2><div class="radio" role="radio" aria-checked="true"><span class="dot"></span><div><b>QRIS</b><small>Scan with any banking or e-wallet app</small></div><span class="tag">Selected</span></div>' +
      '<h2 class="sec">Cancellation</h2><div class="note">' + ic('info') + '<span>' + esc(D.refundRule) + '</span></div>',
      '<div class="price"><b>' + rp(s.price) + '</b><span>Total</span></div><a class="btn primary" href="#qris/' + s.id + '">Pay ' + rp(s.price) + '</a>');
  }
  function qrSvg(seed) {
    var n = 25, cell = 8, x, y, h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    function rnd() { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; }
    function finder(fx, fy) {
      return '<rect x="' + fx * cell + '" y="' + fy * cell + '" width="' + 7 * cell + '" height="' + 7 * cell + '" fill="#1B2340"/><rect x="' + (fx + 1) * cell + '" y="' + (fy + 1) * cell + '" width="' + 5 * cell + '" height="' + 5 * cell + '" fill="#fff"/><rect x="' + (fx + 2) * cell + '" y="' + (fy + 2) * cell + '" width="' + 3 * cell + '" height="' + 3 * cell + '" fill="#1B2340"/>';
    }
    var out = '<svg class="qr" viewBox="0 0 ' + n * cell + ' ' + n * cell + '" role="img" aria-label="Demo QR code. It is not a real payment code.">';
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      var inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9), inLogo = x > 9 && x < 15 && y > 9 && y < 15;
      if (!inFinder && !inLogo && rnd() > 0.52) out += '<rect x="' + x * cell + '" y="' + y * cell + '" width="' + cell + '" height="' + cell + '" fill="#1B2340"/>';
    }
    out += finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7);
    out += '<g transform="translate(' + (10.4 * cell) + ' ' + (10.4 * cell) + ') scale(' + (4.2 * cell / 104) + ')"><path d="M0 18A18 18 0 0 1 18 0H57A4 4 0 0 1 61 4V30A13 13 0 0 0 74 43H100A4 4 0 0 1 104 47V86A18 18 0 0 1 86 104H18A18 18 0 0 1 0 86Z" fill="#1B2340"/><path d="M68 6A6 6 0 0 1 74 0H98A6 6 0 0 1 104 6V30A6 6 0 0 1 98 36H74A6 6 0 0 1 68 30Z" fill="#FFC531"/><path d="M18 22.5A2.5 2.5 0 0 1 20.5 20H41.5A2.5 2.5 0 0 1 44 22.5V57.5A2.5 2.5 0 0 0 46.5 60H81.5A2.5 2.5 0 0 1 84 62.5V83.5A2.5 2.5 0 0 1 81.5 86H20.5A2.5 2.5 0 0 1 18 83.5Z" fill="#FBFBF7"/></g>';
    return out + '</svg>';
  }
  var timerId = null;
  function qris(id) {
    var s = S(id); if (!s) return notFound();
    if (isBooked(s)) { location.replace('#done/' + s.id); return ''; }
    if (isFull(s)) { location.replace('#s/' + s.id); return ''; }
    return screen(head('Pay with QRIS', '#pay/' + s.id), band(s) + '<div class="qr-card"><div class="qr-head"><span>QRIS</span><span class="flag">' + ic('info') + 'Demo · no money is charged</span></div>' + qrSvg(s.id) +
      '<div class="amount">' + rp(s.price) + '</div><p class="lede">Scan with any banking or e-wallet app that supports QRIS.</p><p>Expires in <b class="num" id="timer">10:00</b></p></div>',
      '<button class="btn primary" type="button" data-act="paid" data-id="' + s.id + '">I’ve paid</button>');
  }
  function startTimer() {
    var el = document.getElementById('timer'); if (!el) return;
    var t = 600;
    timerId = setInterval(function () { t = Math.max(0, t - 1); el.textContent = Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); if (!t) clearInterval(timerId); }, 1000);
  }
  function done(id) {
    var s = S(id); if (!s) return notFound();
    if (!isBooked(s)) { location.replace('#s/' + s.id); return ''; }
    var how = s.format.type === 'online' ? 'Your Google Meet link appears in My Sessions 15 minutes before the start.' : s.format.detail;
    return screen(head('You’re booked', null, '<a class="back" style="margin:0 -10px 0 0" href="#week" aria-label="Close">' + ic('close') + '</a>'),
      '<p class="lede" style="margin-bottom:14px">' + esc(M(s).name) + ' will see you on ' + DAY_L[s.day] + '. It’s now in your week, in yellow.</p>' + band(s) +
      '<div class="card"><div class="line"><span class="k">Date</span><span>' + longDate(s.day) + '</span></div><div class="line"><span class="k">Time</span><span>' + s.start + '–' + s.end + '</span></div><div class="line"><span class="k">Where</span><span>' + esc(s.format.place) + '</span></div><div class="line"><span class="k">Paid with QRIS</span><span>' + rp(s.price) + '</span></div><div class="line"><span class="k">Booking code</span><span>' + bookingCode(s) + '</span></div></div>' +
      '<div class="note" style="margin-top:10px">' + ic(s.format.type === 'online' ? 'video' : 'pin') + '<span>' + esc(how) + '</span></div>',
      '<a class="btn secondary" href="#sessions">My Sessions</a><a class="btn primary" href="#week">Back to your week</a>');
  }

  /* ---------- My Sessions ---------- */
  function sessions() {
    var finished = all().filter(function (s) { return isBooked(s) && ended(s); });
    var up = all().filter(function (s) { return isBooked(s) && !ended(s); }).sort(byTime), can = all().filter(function (s) { return state.cancelled[s.id] && !isBooked(s); }), body;
    var tabs = [['upcoming', 'Upcoming (' + up.length + ')'], ['past', 'Past'], ['cancelled', 'Cancelled' + (can.length ? ' (' + can.length + ')' : '')]];
    if (state.mytab === 'upcoming') {
      body = up.length ? up.map(function (s) {
        var online = s.format.type === 'online';
        return '<div class="my" data-sid="' + s.id + '"><div class="my-h"><div class="tm">' + s.start + '<span>' + shortDate(s.day) + '</span></div><div><div class="t">' + esc(s.title) + '</div><div class="meta">' + esc(C(s).name + ' · ' + M(s).name + ' · ' + s.format.place) + '</div></div></div>' +
          '<div class="my-a">' + (online ? '<span class="hint">' + ic('video', 'width="16" height="16" style="vertical-align:-3px"') + ' Meet link opens 15 minutes before</span>' : '<span class="hint">' + ic('pin', 'width="16" height="16" style="vertical-align:-3px"') + ' ' + esc(s.format.place.split(',')[0]) + '</span>') +
          '<button class="link" type="button" data-act="cancel" data-id="' + s.id + '">Cancel</button></div></div>';
      }).join('') : '<div class="empty"><b>No upcoming sessions</b><p>Saturday has a free gap after your class, and sessions fit in it.</p><a class="btn primary" href="#week">See what fits</a></div>';
    } else if (state.mytab === 'past') {
      body = finished.map(function (s) {
        return '<div class="my past"><div class="my-h"><div class="tm">' + s.start + '<span>' + shortDate(s.day) + '</span></div><div><div class="t">' + esc(s.title) + '</div><div class="meta">' + esc(C(s).name + ' · ' + M(s).name) + '</div></div></div><span class="hint">Finished this week</span></div>';
      }).join('') + D.past.map(function (p) {
        var r = state.ratings[p.id], sent = r && r.sent;
        return '<div class="my past"><div class="my-h"><div class="tm">' + p.start + '<span>' + esc(p.date) + '</span></div><div><div class="t">' + esc(p.title) + '</div><div class="meta">' + esc(D.courses[p.course].name + ' · ' + D.mentors[p.mentor].name) + '</div></div></div>' +
          (sent ? '<span class="hint">You rated this ' + r.stars + ' out of 5. Thanks.</span>' : '<a class="btn secondary" href="#rate/' + p.id + '">Rate this session</a>') + '</div>';
      }).join('');
    } else {
      body = can.length ? can.map(function (s) {
        return '<div class="my cancelled"><div class="my-h"><div class="tm">' + s.start + '<span>' + shortDate(s.day) + '</span></div><div><div class="t">' + esc(s.title) + '</div><div class="meta">Cancelled · ' + (refundOf(s) ? rp(refundOf(s)) + ' refunded' : 'not refunded') + '</div></div></div></div>';
      }).join('') : '<div class="empty"><b>Nothing cancelled</b><p>Cancelled bookings and their refunds appear here.</p></div>';
    }
    return screen(head('My Sessions'), '<div class="seg wide" role="group" aria-label="Show" style="margin-bottom:14px">' + tabs.map(function (t) {
      return '<button type="button" aria-pressed="' + (state.mytab === t[0]) + '" data-act="mytab" data-v="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div><div class="stack">' + body + '</div>');
  }

  /* ---------- Confirm dialog ---------- */
  function openDialog(title, body, note, yesLabel, yesAct, id, noLabel) {
    dlg.innerHTML = '<h2 id="dlg-title">' + esc(title) + '</h2><p>' + body + '</p><div class="note">' + ic('info') + '<span>' + note + '</span></div><div class="dlg-a"><button class="btn secondary" type="button" data-act="dlg-close">' + esc(noLabel) + '</button><button class="btn primary" type="button" data-act="' + yesAct + '" data-id="' + id + '">' + esc(yesLabel) + '</button></div>';
    dlg.showModal();
    dlg.querySelector('[data-act="dlg-close"]').focus();
  }
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  /* ---------- Host ---------- */
  function host() {
    if (state.role === 'approved') return hostDash();
    if (state.role === 'review') return screen(head('Host'), '<div class="empty"><b>Your application is under review</b><p>You can keep booking sessions while we check it. Publishing unlocks once you’re approved.</p><a class="btn secondary" href="#applied">See application</a></div>');
    return screen(head('Teach a course you aced'), '<p class="lede">Keep 80% of every booking, in your own free time. The highlighted block in your week shows how a session would fit on Friday.</p>' +
      '<div class="card" style="margin-top:14px"><div class="seats" style="margin-top:0">' + cellsHtml(6, 6) + '<span>6 students × Rp25.000</span></div><div class="line"><span class="k">LearNect’s 20%</span><span>Rp30.000</span></div><div class="line total"><span>You keep</span><span>Rp120.000</span></div></div>' +
      '<h2 class="sec">How it works</h2><ol class="steps"><li><b>Apply with your transcript</b><span>Tell us which courses you can teach and how.</span></li><li><b>Get approved</b><span>We review your grades and your answers.</span></li><li><b>Publish sessions in your free time</b><span>LearNect checks each one against your week.</span></li></ol>',
      '<a class="btn primary" href="#apply">Apply to teach</a>');
  }
  function hostRow(h) {
    return '<a class="host-row" data-sid="' + h.id + '" href="#manage/' + h.id + '"><span class="tm">' + h.start + '<small>' + DAY_S[h.day] + ' ' + dayNum(h.day) + '</small></span><span><h3>' + esc(h.title) + '</h3><p><i class="cdot" style="background:var(--' + D.courses[h.course].colour + ')"></i>' + esc(D.courses[h.course].code + ' · ' + (h.type === 'online' ? 'Online' : h.place.split(',')[0])) + '</p>' +
      '<span class="foot">' + cellsHtml(h.booked, h.seats) + '<span>' + h.booked + ' × ' + rp(h.price) + '</span></span><span class="foot"><span>You keep</span><span>' + rp(share(h.booked * h.price)) + '</span></span></span></a>';
  }
  function hostDash() {
    var list = liveHosted(), body;
    if (state.hostTab === 'past') body = '<div class="empty"><b>No completed sessions yet</b><p>Finished sessions appear here with what you earned from each.</p></div>';
    else if (!list.length) body = '<div class="empty"><b>No sessions yet</b><p>Publish your first session in a free slot.</p></div>';
    else body = list.map(hostRow).join('');
    return screen(head('Host', null, '<span class="status">Approved mentor</span>'), '<div class="seg wide" role="group" aria-label="Show sessions" style="margin-bottom:12px">' + [['upcoming', 'Upcoming (' + list.length + ')'], ['past', 'Past']].map(function (t) {
      return '<button type="button" aria-pressed="' + (state.hostTab === t[0]) + '" data-act="hosttab" data-v="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div><div class="stack">' + body + '</div><div class="menu" style="margin-top:12px"><a href="#earnings">' + ic('cal') + '<span>Earnings · ' + rp(projected()) + ' projected</span>' + ic('back', 'class="chev"') + '</a></div>',
      '<a class="btn primary" href="#new">' + ic('plus') + 'Create session</a>');
  }
  function field(id, label, control, err, hint) {
    return '<div class="field' + (err ? ' has-err' : '') + '"><label for="' + id + '">' + label + '</label>' + control + (hint ? '<p class="hint">' + hint + '</p>' : '') + (err ? '<p class="err" id="' + id + '-err">' + ic('warn') + '<span>' + esc(err) + '</span></p>' : '') + '</div>';
  }
  function errLine(msg) { return msg ? '<p class="err">' + ic('warn') + '<span>' + esc(msg) + '</span></p>' : ''; }
  var appErr = {};
  function apply() {
    if (state.role !== 'none') { location.replace('#applied'); return ''; }
    var a = state.app;
    var courses = '<div class="chips" role="group" aria-label="Courses you can teach">' + Object.keys(D.courses).map(function (k) {
      return '<button type="button" class="chip" id="ap-c-' + k + '" aria-pressed="' + (a.courses.indexOf(k) >= 0) + '" data-act="ap-course" data-v="' + k + '"><i style="background:var(--' + D.courses[k].colour + ')"></i>' + esc(D.courses[k].name) + '</button>';
    }).join('') + '</div>';
    var transcript = a.transcript ? '<div class="file">' + ic('check') + '<span><b>Transcript_' + esc(me().name) + '.pdf</b><small>Sample file for this demo</small></span><button class="link" id="ap-transcript" type="button" data-act="ap-transcript">Remove</button></div>'
      : '<button class="btn secondary block" id="ap-transcript" type="button" data-act="ap-transcript">Attach sample transcript</button>';
    return screen(head('Apply to teach', '#host'), '<form class="form" id="apply-form" novalidate><p class="lede">We review every application before you can publish sessions.</p>' +
      field('ap-name', 'Full name', '<input id="ap-name" value="' + esc(me().full) + '" readonly aria-readonly="true">', null, 'From your LearNect account') +
      field('ap-campus', 'Campus', '<select id="ap-campus" data-ap="campus">' + D.campuses.map(function (c) { return '<option' + (c === a.campus ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>') +
      '<div class="field' + (appErr.courses ? ' has-err' : '') + '"><span class="flabel">Courses you can teach</span>' + courses + errLine(appErr.courses) + '</div>' +
      field('ap-gpa', 'GPA', '<input id="ap-gpa" data-ap="gpa" inputmode="decimal" autocomplete="off" value="' + esc(a.gpa) + '"' + (appErr.gpa ? ' aria-invalid="true" aria-describedby="ap-gpa-err"' : '') + '>', appErr.gpa) +
      '<div class="field' + (appErr.transcript ? ' has-err' : '') + '"><span class="flabel">Transcript</span>' + transcript + errLine(appErr.transcript) + '</div>' +
      field('ap-why', 'How would you teach this course?', '<textarea id="ap-why" data-ap="why" rows="5"' + (appErr.why ? ' aria-invalid="true" aria-describedby="ap-why-err"' : '') + '>' + esc(a.why) + '</textarea>', appErr.why, '<span id="ap-count">' + words(a.why) + '</span> of 20 words minimum') +
      '<div class="field"><span class="flabel">Preferred format</span><div class="seg wide" role="group" aria-label="Preferred format">' + [['online', 'Online'], ['onsite', 'On-site'], ['both', 'Both']].map(function (f) {
        return '<button type="button" id="ap-f-' + f[0] + '" aria-pressed="' + (a.format === f[0]) + '" data-act="ap-format" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field' + (appErr.confirm ? ' has-err' : '') + '"><label class="check"><input type="checkbox" id="ap-confirm" data-ap="confirm"' + (a.confirm ? ' checked' : '') + '><span>The information I gave is accurate and follows the academic code of conduct.</span></label>' + errLine(appErr.confirm) + '</div></form>',
      '<button class="btn primary" type="button" data-act="ap-submit">Submit application</button>');
  }
  function submitApply() {
    var a = state.app, e = {}, g = parseFloat(String(a.gpa).replace(',', '.'));
    if (!a.courses.length) e.courses = 'Pick at least one course.';
    if (isNaN(g) || g < 0 || g > 4) e.gpa = 'Write your GPA as a number from 0 to 4, like 3.72.';
    if (!a.transcript) e.transcript = 'Attach your transcript so we can check your grades.';
    if (words(a.why) < 20) e.why = 'Write at least 20 words about how you would teach.';
    if (!a.confirm) e.confirm = 'Tick this box to confirm your answers.';
    appErr = e;
    if (Object.keys(e).length) {
      render({ keep: true });
      var first = paneEl.querySelector('.has-err');
      if (first) { first.scrollIntoView({ block: 'center' }); var f = first.querySelector('input, textarea, select, button'); if (f) f.focus({ preventScroll: true }); }
      return;
    }
    if (API) {
      if (busy) return;
      working(document.querySelector('[data-act="ap-submit"]'), 'Submitting…');
      API.apply(a).then(function () { return sync(true); }).then(function () { busy = false; location.hash = '#applied'; }).catch(failed('Application not sent'));
      return;
    }
    state.role = 'review'; save(); location.hash = '#applied';
  }
  function applied() {
    if (state.role === 'none') { location.replace('#apply'); return ''; }
    var a = state.app, ok = state.role === 'approved';
    return screen(head(ok ? 'You’re approved' : 'Application submitted', null, '<a class="back" style="margin:0 -10px 0 0" href="#host" aria-label="Close">' + ic('close') + '</a>'),
      '<p class="lede" style="margin-bottom:14px">' + (ok ? 'You can publish sessions from Host.' : 'We’ll notify you when your status changes. You can keep booking sessions meanwhile.') + '</p>' +
      '<div class="card"><div class="line"><span class="k">Status</span><span><b>' + (ok ? 'Approved' : 'Under review') + '</b></span></div><div class="line"><span class="k">Applicant</span><span>' + esc(me().full) + '</span></div><div class="line"><span class="k">Campus</span><span>' + esc(a.campus) + '</span></div><div class="line"><span class="k">Courses</span><span>' + a.courses.map(function (c) { return esc(D.courses[c].name); }).join(', ') + '</span></div><div class="line"><span class="k">GPA</span><span>' + esc(a.gpa) + '</span></div></div>' +
      (ok ? '<a class="btn primary block" style="margin-top:16px" href="#host">Go to Host</a>' : '<div class="demo-box"><span class="flag">Demo control</span><p>In the real product, the LearNect team reviews this. For the showcase, approve it here.</p><button class="btn primary block" type="button" data-act="ap-approve">Approve application</button></div>'));
  }

  /* ---------- Create session: the proposed block is drawn live in the week ---------- */
  function nwEnd() { return mins(state.nw.start) + state.nw.len; }
  function nwClash() {
    var a = mins(state.nw.start), b = nwEnd(), hit = null;
    if (b > END) return { start: hhmm(END), end: hhmm(END), title: 'the end of the day', late: true };
    if (D.isPast(state.nw.day, state.nw.start)) return { start: state.nw.start, end: hhmm(b), title: 'a time that has passed', past: true };
    classesOn(state.nw.day).forEach(function (c) { if (mins(c.start) < b && mins(c.end) > a) hit = c; });
    D.sessions.forEach(function (s) { if (s.day === state.nw.day && isBooked(s) && mins(s.start) < b && mins(s.end) > a) hit = { start: s.start, end: s.end, title: s.title, booked: true }; });
    return hit;
  }
  function nwFitHtml() {
    var c = nwClash(), n = state.nw;
    if (c && c.past) return '<div class="fit clash">' + ic('warn') + '<span>That time has already passed. Pick a later time or day.</span></div>';
    if (c && c.late) return '<div class="fit clash">' + ic('warn') + '<span>This session would end after 21:00. Pick an earlier start or a shorter length.</span></div>';
    return c ? '<div class="fit clash">' + ic('warn') + '<span>Clashes with ' + (c.booked ? 'your booked session' : c.teaching ? 'your session' : 'your class') + ' <b>' + esc(c.title) + '</b> (' + c.start + '–' + c.end + ').</span></div>'
      : '<div class="fit">' + ic('gap') + '<span>' + DAY_L[n.day] + ' ' + n.start + '–' + hhmm(nwEnd()) + ' fits your free time.</span></div>';
  }
  function stepper(label, key, val, shown) {
    var lim = key === 'seats' ? [4, 10] : [15000, 50000];
    return '<div class="field"><span class="flabel">' + label + '</span><div class="stepper"><button type="button" id="st-' + key + '-m" aria-label="Fewer: ' + label + '" data-act="nw-step" data-k="' + key + '" data-d="-1"' + (val <= lim[0] ? ' disabled' : '') + '>' + ic('minus') + '</button><output aria-live="polite">' + shown + '</output><button type="button" id="st-' + key + '-p" aria-label="More: ' + label + '" data-act="nw-step" data-k="' + key + '" data-d="1"' + (val >= lim[1] ? ' disabled' : '') + '>' + ic('plus') + '</button></div></div>';
  }
  var nwErr = '';
  function newSession() {
    if (state.role !== 'approved') { location.replace('#host'); return ''; }
    var n = state.nw, times = '', blocked = !!nwClash();
    for (var t = START; t <= 20 * 60; t += 30) times += '<option' + (hhmm(t) === n.start ? ' selected' : '') + '>' + hhmm(t) + '</option>';
    return screen(head('Create session', '#host'), '<form class="form" id="new-form" novalidate>' +
      '<div class="field"><span class="flabel">Course</span><div class="chips" role="group" aria-label="Course">' + Object.keys(D.courses).map(function (k) {
        return '<button type="button" class="chip" id="nw-c-' + k + '" aria-pressed="' + (n.course === k) + '" data-act="nw-course" data-v="' + k + '"><i style="background:var(--' + D.courses[k].colour + ')"></i>' + esc(D.courses[k].name) + '</button>';
      }).join('') + '</div></div>' +
      field('nw-title', 'Session title', '<input id="nw-title" data-nw="title" maxlength="40" autocomplete="off" value="' + esc(n.title) + '"' + (nwErr ? ' aria-invalid="true" aria-describedby="nw-title-err"' : '') + '>', nwErr) +
      '<div class="field"><span class="flabel label-row">Day<small>or click a free time in your week</small></span><div class="days" role="group" aria-label="Day">' + DAY_S.map(function (d, i) {
        return '<button type="button" class="day" id="nw-d-' + i + '" aria-pressed="' + (i === n.day) + '" data-act="nw-day" data-v="' + i + '"' + (i < D.TODAY_INDEX ? ' disabled' : '') + ' aria-label="' + longDate(i) + '">' + d + '<b>' + dayNum(i) + '</b></button>';
      }).join('') + '</div></div>' +
      '<div class="two">' + field('nw-start', 'Start', '<select id="nw-start" data-nw="start">' + times + '</select>') +
      '<div class="field"><span class="flabel">Length</span><div class="seg wide" role="group" aria-label="Length" style="min-height:46px">' + [60, 90, 120].map(function (l) {
        return '<button type="button" id="nw-l-' + l + '" style="padding:0 6px" aria-pressed="' + (n.len === l) + '" data-act="nw-len" data-v="' + l + '">' + l + 'm</button>';
      }).join('') + '</div></div></div><div id="nw-fit">' + nwFitHtml() + '</div>' +
      '<div class="field"><span class="flabel">Format</span><div class="seg wide" role="group" aria-label="Format">' + [['online', 'Online'], ['onsite', 'On-site']].map(function (f) {
        return '<button type="button" id="nw-f-' + f[0] + '" aria-pressed="' + (n.format === f[0]) + '" data-act="nw-format" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div></div><div class="two">' + stepper('Seats', 'seats', n.seats, String(n.seats)) + stepper('Price per seat', 'price', n.price, rp(n.price)) + '</div>' +
      '<div class="card"><div class="line"><span class="k">If every seat sells</span><span>' + rp(n.seats * n.price) + '</span></div><div class="line total"><span>You keep 80%</span><span>' + rp(share(n.seats * n.price)) + '</span></div></div></form>',
      '<button class="btn primary" type="button" data-act="nw-publish"' + (blocked ? ' disabled' : '') + '>' + (blocked ? 'Pick a free time' : 'Publish session') + '</button>');
  }
  function publish() {
    var n = state.nw;
    if (!n.title.trim()) { nwErr = 'Give your session a title.'; render({ keep: true }); var i = document.getElementById('nw-title'); if (i) i.focus(); return; }
    if (nwClash()) return;
    nwErr = '';
    function next() {
      state.nw = clone(D.newSessionSeed); state.nw.title = ''; state.hostTab = 'upcoming';
      for (var t = mins(state.nw.start); t <= 19 * 60 && nwClash(); t += 30) state.nw.start = hhmm(t);
      busy = false; save();
      location.hash = '#host';
    }
    if (API) {
      if (busy) return;
      working(document.querySelector('[data-act="nw-publish"]'), 'Publishing…');
      API.publish({ course: n.course, title: n.title.trim(), day: n.day, start: n.start, len: n.len, format: n.format, seats: n.seats, price: n.price })
        .then(function () { return sync(true); }).then(next).catch(failed('Session not published'));
      return;
    }
    state.hosted.push({ id: 'h-' + Date.now(), course: n.course, title: n.title.trim(), day: n.day, start: n.start, end: hhmm(nwEnd()), price: n.price, seats: n.seats, booked: 0, type: n.format, place: n.format === 'online' ? 'Google Meet' : 'Study Room, ' + state.app.campus.split(' (')[0] + ' Campus' });
    next();
  }
  function manage(id) {
    var h = hosted(id); if (!h) return notFound();
    return screen(head('Manage session', '#host'), '<div class="band teach"><div class="tm">' + h.start + '<span>' + h.end + '</span></div><div><div class="t">' + esc(h.title) + '</div><div class="m">' + longDate(h.day) + '</div><div class="m"><i class="cdot" style="background:var(--' + D.courses[h.course].colour + ')"></i>' + esc(D.courses[h.course].name + ' · ' + (h.type === 'online' ? 'Online' : 'On-site')) + '</div></div></div>' +
      '<div class="seats">' + cellsHtml(h.booked, h.seats) + '<span>' + h.booked + ' of ' + h.seats + ' seats booked</span></div>' +
      '<h2 class="sec">Where</h2><div class="card place"><span class="ic">' + ic(h.type === 'online' ? 'video' : 'pin') + '</span><div><b>' + esc(h.place) + '</b><p>' + (h.type === 'online' ? 'The Meet link goes to your students 15 minutes before the start.' : 'Arrive 10 minutes early to open the room.') + '</p></div></div>' +
      '<h2 class="sec">Earnings</h2><div class="card"><div class="line"><span class="k">' + h.booked + ' × ' + rp(h.price) + '</span><span>' + rp(h.booked * h.price) + '</span></div><div class="line"><span class="k">LearNect’s 20%</span><span>' + rp(h.booked * h.price - share(h.booked * h.price)) + '</span></div><div class="line total"><span>You keep</span><span>' + rp(share(h.booked * h.price)) + '</span></div></div>',
      '<button class="btn secondary" type="button" data-act="host-cancel" data-id="' + h.id + '">Cancel session</button>');
  }
  function earnings() {
    if (state.role !== 'approved') { location.replace('#host'); return ''; }
    var list = liveHosted();
    return screen(head('Earnings'), '<div class="card earn"><span>Projected, your 80%</span><b>' + rp(projected()) + '</b><div class="line"><span class="k">Available for payout</span><span>Rp0</span></div></div><h2 class="sec">From your sessions</h2>' +
      '<div class="stack">' + (list.length ? list.map(hostRow).join('') : '<div class="empty"><b>No sessions yet</b><p>Publish a session to see what it can earn.</p></div>') + '</div><p class="hint" style="margin-top:10px">Money becomes available after each session is completed.</p>');
  }

  /* ---------- Rating ---------- */
  function rate(id) {
    var p = D.past.filter(function (x) { return x.id === id; })[0]; if (!p) return notFound();
    var r = state.ratings[id] || { stars: 0, tags: [], note: '', sent: false }, stars = '';
    if (r.sent) return screen(head('Thanks for rating', '#sessions'), '<p class="lede" style="margin-bottom:16px">Your feedback helps ' + esc(D.mentors[p.mentor].name) + ' and the next student.</p><a class="btn primary block" href="#sessions">Back to My Sessions</a>');
    for (var i = 1; i <= 5; i++) stars += '<button type="button" id="star-' + i + '" class="star' + (i <= r.stars ? ' on' : '') + '" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '" aria-pressed="' + (i === r.stars) + '" data-act="rate-star" data-id="' + id + '" data-v="' + i + '">' + ic('star') + '</button>';
    return screen(head('Rate session', '#sessions'), '<div class="band sun"><div class="tm">' + p.start + '<span>' + p.end + '</span></div><div><div class="t">' + esc(p.title) + '</div><div class="m">' + esc(p.date) + '</div><div class="m">' + esc(D.courses[p.course].name + ' · ' + D.mentors[p.mentor].name) + '</div></div></div><div class="form">' +
      '<div class="field"><span class="flabel">How was this session?</span><div class="stars" role="group" aria-label="Rating">' + stars + '</div></div>' +
      '<div class="field"><span class="flabel">What went well?</span><div class="chips">' + D.ratingTags.map(function (t, x) {
        return '<button type="button" id="tag-' + x + '" class="chip" aria-pressed="' + (r.tags.indexOf(t) >= 0) + '" data-act="rate-tag" data-id="' + id + '" data-v="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div></div>' + field('rate-note', 'Anything else? (optional)', '<textarea id="rate-note" data-rate="' + id + '" rows="3">' + esc(r.note) + '</textarea>') + '</div>',
      '<button class="btn primary" type="button" data-act="rate-send" data-id="' + id + '"' + (r.stars ? '' : ' disabled') + '>' + (r.stars ? 'Send rating' : 'Pick a star rating') + '</button>');
  }

  /* ---------- Notifications, help, profile ---------- */
  function notifications() {
    var items = [];
    D.sessions.filter(isBooked).forEach(function (s) { items.push(['check', 'Booking confirmed', esc(s.title) + ', ' + shortDate(s.day) + ' at ' + s.start, '#sessions']); });
    if (state.role === 'review') items.push(['info', 'Application received', 'We’re reviewing your mentor application.', '#applied']);
    if (state.role === 'approved') items.push(['check', 'You’re an approved mentor', 'You can now publish sessions.', '#host']);
    if (!state.ratings.basics || !state.ratings.basics.sent) items.push(['star', 'Rate your last session', 'How was Python Basics Review with Alya?', '#rate/basics']);
    items.push(['gap', 'Sessions fit your Saturday', 'See what’s in your free gap after 11:00.', '#week']);
    return screen(head('Notifications'), '<div class="notif">' + items.map(function (n) {
      return '<a href="' + n[3] + '"><span class="ic">' + ic(n[0]) + '</span><span><b>' + n[1] + '</b><small>' + n[2] + '</small></span></a>';
    }).join('') + '</div><h2 class="sec">Send me</h2><div class="card stack">' + [['remind', 'Session reminders'], ['fits', 'New sessions that fit my week']].map(function (p) {
      return '<label class="switch"><span>' + p[1] + '</span><input type="checkbox" role="switch" data-pref="' + p[0] + '"' + (state.prefs[p[0]] ? ' checked' : '') + '><i aria-hidden="true"></i></label>';
    }).join('') + '</div>');
  }
  function help() {
    return screen(head('Help & support'), '<div class="faq">' + D.help.map(function (h) {
      return '<div><h2>' + esc(h.q) + '</h2><p>' + esc(h.a.replace('tap Cancel', 'select Cancel')) + '</p></div>';
    }).join('') + '</div>');
  }
  function profile() {
    var teach, n = liveHosted().length;
    if (state.role === 'approved') teach = '<div class="card stack"><div class="filter-row"><b>' + (n ? plural(n, 'upcoming session', 'upcoming sessions') : 'No upcoming sessions') + '</b><span class="status">Approved mentor</span></div><p class="lede">' + rp(projected()) + ' projected</p><a class="btn primary block" href="#host">Manage teaching</a></div>';
    else if (state.role === 'review') teach = '<div class="card stack"><div class="filter-row"><b>Mentor application</b><span class="status">Under review</span></div><p class="lede">We’ll notify you when your status changes.</p><a class="btn secondary block" href="#applied">See application</a></div>';
    else teach = '<div class="card stack"><b>Want to teach?</b><p class="lede">Help other students with a course you aced and keep 80% of each booking.</p><a class="btn primary block" href="#host">Become a mentor</a></div>';
    function row(href, icon, label) { return '<a href="' + href + '">' + ic(icon) + '<span>' + label + '</span>' + ic('back', 'class="chev"') + '</a>'; }
    return screen(head('Profile'), '<div class="card mentor"><span class="avatar" aria-hidden="true">' + esc(me().full.charAt(0)) + '</span><div><b>' + esc(me().full) + '</b><div class="meta">' + esc(me().major) + ' · ' + esc(me().campus) + '</div></div></div>' +
      '<h2 class="sec">My courses</h2><div class="chips">' + Object.keys(D.courses).map(function (k) { return '<span class="chip chip-static"><i style="background:var(--' + D.courses[k].colour + ')"></i>' + esc(D.courses[k].name) + '</span>'; }).join('') + '</div>' +
      '<h2 class="sec">Teaching</h2>' + teach + '<h2 class="sec">Account</h2><div class="menu">' + row('#notifications', 'bell', 'Notifications') + row('#help', 'info', 'Help & support') + '</div>' +
      (API && me().guest ? '<div class="note" style="margin-top:14px">' + ic('info') + '<span>You’re using LearNect as a guest. Your bookings stay until you sign out.</span></div>' : '') +
      '<button class="btn secondary block" style="margin-top:14px" type="button" data-act="reset">' + (API ? 'Sign out' : 'Reset demo') + '</button>');
  }

  /* ---------- Sign in and create account ---------- */
  var authMode = 'in', authErr = '', authNote = '', authVals = { name: '', email: '' };
  function signin() {
    if (!API) { location.replace('#week'); return ''; }
    if (signedIn()) { var to = state.after || '#week'; state.after = null; save(); location.replace(to); return ''; }
    var up = authMode === 'up';
    return screen(head(up ? 'Create your account' : 'Sign in'),
      '<div class="seg wide" role="group" aria-label="Account" style="margin-bottom:14px">' + [['in', 'Sign in'], ['up', 'Create account']].map(function (t) {
        return '<button type="button" id="au-m-' + t[0] + '" aria-pressed="' + (authMode === t[0]) + '" data-act="auth-mode" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<form class="form" id="auth-form" novalidate><p class="lede">' + (up ? 'One account to book sessions and to teach the courses you aced.' : 'Sign in to book sessions, see My Sessions and host your own.') + '</p>' +
      (up ? field('au-name', 'Full name', '<input id="au-name" autocomplete="name" maxlength="60" value="' + esc(authVals.name) + '">') : '') +
      field('au-email', 'Email', '<input id="au-email" type="email" autocomplete="email" inputmode="email" value="' + esc(authVals.email) + '">') +
      field('au-pass', 'Password', '<input id="au-pass" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '">', null, up ? 'At least 6 characters' : '') +
      errLine(authErr) + (authNote ? '<div class="note">' + ic('info') + '<span>' + esc(authNote) + '</span></div>' : '') +
      '<button type="submit" hidden></button></form>' +
      '<div class="demo-box"><span class="flag">Just looking?</span><p>Try every feature without an account. As a guest, your bookings are real seats and stay until you sign out.</p><button class="btn secondary block" type="button" data-act="auth-guest">Continue as guest</button></div>',
      '<button class="btn primary" type="button" data-act="auth-go">' + (up ? 'Create account' : 'Sign in') + '</button>');
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function authFail(msg) {
    busy = false; authErr = msg; authNote = ''; render({ keep: true });
    var bad = document.getElementById(!authVals.email ? 'au-email' : 'au-pass'); if (bad) bad.focus();
  }
  function afterAuth() {
    authErr = ''; authNote = ''; authVals = { name: '', email: '' };
    return sync(true).then(function () {
      busy = false;
      var to = state.after || '#week'; state.after = null; save();
      if (location.hash === to) render({ moved: true }); else location.hash = to;
    });
  }
  function doAuth(btn) {
    if (busy) return;
    var up = authMode === 'up', name = up ? val('au-name').trim() : '', email = val('au-email').trim(), pass = val('au-pass');
    authVals = { name: name, email: email };
    if (up && !name) return authFail('Write your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authFail('Write your email, like you@binus.ac.id.');
    if (pass.length < 6) return authFail('Use a password of at least 6 characters.');
    working(btn || paneEl.parentNode.querySelector('[data-act="auth-go"]'), up ? 'Creating account…' : 'Signing in…');
    (up ? API.signUp(name, email, pass) : API.signIn(email, pass)).then(function (r) {
      if (r && r.needsConfirm) { busy = false; authMode = 'in'; authErr = ''; authNote = 'We sent a confirmation link to ' + email + '. Open it, then sign in here.'; render({ keep: true }); return; }
      return afterAuth();
    }).catch(function (e) { authFail(e.message); });
  }

  /* ---------- The week ---------- */
  function activeId() { return current.name === 'week' ? state.pick : inBooking() ? current.id : null; }
  function proposal() {
    if (current.name === 'new' && state.role === 'approved') {
      var n = state.nw; return { day: n.day, a: mins(n.start), b: Math.min(END, nwEnd()), course: n.course, title: n.title || 'Your session', clash: !!nwClash() };
    }
    if (current.name === 'host' && state.role === 'none') return { day: 4, a: 15 * 60, b: 16 * 60 + 30, course: 'prog', title: 'Arrays & Strings', clash: false };
    return null;
  }
  function weekSessions() {
    var act = S(activeId());
    if (current.name === 'week' || inBooking()) return D.sessions.filter(function (s) { return isBooked(s) || matches(s) || s === act; });
    return D.sessions.filter(isBooked);
  }
  function layout(items) {
    items.sort(function (x, y) { return x.a - y.a || y.b - x.b; });
    var group = null, end = -1, groups = [];
    items.forEach(function (it) { if (!group || it.a >= end) { group = []; groups.push(group); end = it.b; } else end = Math.max(end, it.b); group.push(it); });
    groups.forEach(function (g) { var cols = []; g.forEach(function (it) { var c = 0; while (cols[c] > it.a) c++; cols[c] = it.b; it.col = c; }); g.forEach(function (it) { it.n = cols.length; }); });
  }
  function pos(it) {
    var top = (it.a - START) / (END - START) * 100, h = (it.b - it.a) / (END - START) * 100;
    return 'top:calc(' + top + '% + 1px);height:calc(' + h + '% - 2px);left:calc(' + (it.col / it.n * 100) + '% + 2px);width:calc(' + (100 / it.n) + '% - 4px)';
  }
  function weekHtml() {
    var act = S(activeId()), prop = proposal(), wk = weekSessions(), manageId = current.name === 'manage' ? current.id : null;
    var focusDay = prop ? prop.day : act ? act.day : -1, html = '<div class="wk-corner"></div>';
    DAY_S.forEach(function (n, i) { html += '<div class="wk-dh' + (i === D.TODAY_INDEX ? ' today' : '') + (i === focusDay ? ' on' : '') + '">' + n + ' <b>' + dayNum(i) + '</b></div>'; });
    html += '<div class="wk-hours">';
    for (var t = START; t < END; t += 120) html += '<span style="top:' + (t - START) / (END - START) * 100 + '%">' + hhmm(t) + '</span>';
    html += '</div>';
    DAY_S.forEach(function (n, d) {
      var items = classesOn(d).map(function (c) { return { kind: c.teaching ? 'teach' : 'class', a: mins(c.start), b: mins(c.end), c: c }; })
        .concat(wk.filter(function (s) { return s.day === d && (s === act || isBooked(s) || !clashOf(s)); }).map(function (s) { return { kind: 'session', a: mins(s.start), b: mins(s.end), s: s }; }));
      if (prop && prop.day === d) items.push({ kind: 'new', a: prop.a, b: prop.b, p: prop });
      layout(items);
      html += '<div class="wk-col' + (current.name === 'new' ? (d >= D.TODAY_INDEX ? ' can-place' : ' no-place') : '') + '" data-day="' + d + '" role="group" aria-label="' + longDate(d) + '">';
      var mark = prop && prop.day === d && !prop.clash ? prop : (act && act.day === d && !clashOf(act) ? { a: mins(act.start), b: mins(act.end) } : null);
      if (mark) freeGaps(d).forEach(function (g) {
        if (mark.a >= g[0] && mark.b <= g[1]) html += '<div class="gap" style="top:' + (g[0] - START) / (END - START) * 100 + '%;height:' + (g[1] - g[0]) / (END - START) * 100 + '%"></div>';
      });
      items.forEach(function (it) {
        var sh = it.b - it.a <= 60 ? ' short' : '';
        if (it.kind === 'class') {
          html += '<div class="b cls" style="' + pos(it) + '" title="' + esc(it.c.title + ', ' + it.c.start + ' to ' + it.c.end) + '"><b>' + esc(it.c.title.split(' ')[0]) + '</b><span>' + esc(it.c.room) + '</span></div>';
        } else if (it.kind === 'teach') {
          html += '<a class="b teach' + sh + (it.c.hostId === manageId ? ' is-on" data-keep="1' : '') + '" data-sid="' + it.c.hostId + '" href="#manage/' + it.c.hostId + '" style="' + pos(it) + '" aria-label="' + esc('You’re teaching ' + it.c.title + ', ' + it.c.start + ' to ' + it.c.end) + '"><b>' + it.c.start + '</b><span>' + esc(it.c.title) + '</span></a>';
        } else if (it.kind === 'new') {
          html += '<div class="b is-new' + sh + ' ' + D.courses[it.p.course].colour + '" style="' + pos(it) + '" role="img" aria-label="' + esc('Proposed session ' + it.p.title + ' at ' + hhmm(it.p.a) + (it.p.clash ? ', clashes' : ', fits your free time')) + '"><b>' + hhmm(it.p.a) + '</b><span>' + esc(it.p.title) + '</span></div>';
        } else {
          var s = it.s, drop = state.lastBooked === s.id ? ' drop' : '';
          html += '<button type="button" class="b ' + tone(s) + sh + (s === act ? ' is-on' : '') + drop + '" data-act="pick" data-id="' + s.id + '" data-sid="' + s.id + '" style="' + pos(it) + '" aria-pressed="' + (s === act) + '" aria-label="' + esc(s.title + ', ' + DAY_L[s.day] + ' ' + s.start + ' to ' + s.end + (isBooked(s) ? ', booked' : ', ' + rp(s.price))) + '"><b>' + s.start + '</b><span>' + esc(SHORT[s.id] || s.title) + '</span></button>';
        }
      });
      html += '</div>';
    });
    var dock = '';
    if (current.name === 'week' && act && (matches(act) || isBooked(act))) {
      var clash = clashOf(act), line = isBooked(act) ? 'You have a seat. It’s in your week.' : isFull(act) ? (ended(act) ? 'This session has started.' : 'This session is full.') : clash ? 'Clashes with your ' + clash.start + ' class.' : fitShort(act);
      var cta = isBooked(act) ? '<a class="btn primary" href="#sessions">View booking</a>' : isFull(act) ? '<button class="btn" type="button" disabled>' + (ended(act) ? 'Started' : 'Session full') + '</button>' : '<a class="btn primary" href="#pay/' + act.id + '">Book session</a>';
      dock = '<div class="dock"><span class="band-t ' + (tone(act) === 'full' ? C(act).colour : tone(act)) + '">' + act.start + '</span><div><h3>' + esc(act.title) + '</h3><p>' + esc(line) + '</p></div><b>' + rp(act.price) + '</b><a class="btn secondary" href="#s/' + act.id + '">Details</a>' + cta + '</div>';
    }
    var legend = '<div class="legend" aria-hidden="true"><span><i class="k-class"></i>Your class</span><span class="opt"><i class="k-gap"></i>Free gap</span>' + (state.role === 'approved' ? '<span class="opt"><i class="k-teach"></i>Teaching</span>' : '') + '<span><i class="k-mine"></i>Your booking</span>' + (current.name === 'new' ? '<span><i class="k-off"></i>Can’t schedule</span>' : '') + '</div>';
    return '<div class="w-top"><h2>Your week, ' + esc(D.WEEK_LABEL) + '</h2>' + legend + '</div><div class="wk-scroll" style="flex:1;min-height:0;display:flex"><div class="wk" style="flex:1">' + html + '</div></div>' + dock;
  }
  function navHtml() {
    var group = ROUTES[current.name], items = [['week', 'Your week'], ['sessions', 'My Sessions'], ['host', 'Host']];
    if (state.role === 'approved') items.push(['earnings', 'Earnings']);
    return '<a class="logo" href="../"><img src="../assets/brand/logo.svg?v=2" alt="" width="28" height="28">LearNect</a>' +
      '<nav class="links" aria-label="Main">' + items.map(function (i) { return '<a href="#' + i[0] + '"' + (group === i[0] ? ' aria-current="page"' : '') + '>' + i[1] + '</a>'; }).join('') + '</nav>' +
      '<div class="tools">' + (API ? '<span class="demo-tag">Demo<span class="demo-more"> · simulated QRIS</span></span>' : '<span class="demo-tag">Demo<span class="demo-more"> · sample data</span></span><button class="text-btn" type="button" data-act="reset">Reset demo</button>') +
      (API && !signedIn() ? '' : '<a class="icon" href="#notifications" aria-label="Notifications"' + (group === 'notifications' ? ' aria-current="page"' : '') + '>' + ic('bell') + '</a>') +
      '<a class="icon" href="#help" aria-label="Help and support"' + (group === 'help' ? ' aria-current="page"' : '') + '>' + ic('info') + '</a>' +
      (API && !signedIn() ? '<a class="text-btn keep" href="#signin"' + (current.name === 'signin' ? ' aria-current="page"' : '') + '>Sign in</a></div>'
        : '<a class="me" href="#profile" aria-label="Profile"' + (group === 'profile' ? ' aria-current="page"' : '') + '><span>' + esc(me().full) + '</span><b aria-hidden="true">' + esc(me().full.charAt(0)) + '</b></a></div>');
  }

  /* ---------- Render ---------- */
  var TITLES = { week: 'Your week', s: 'Session', pay: 'Review & pay', qris: 'Pay with QRIS', done: 'Booking confirmed', sessions: 'My Sessions', host: 'Host', apply: 'Apply to teach', applied: 'Application', new: 'Create session', manage: 'Manage session', earnings: 'Earnings', rate: 'Rate session', notifications: 'Notifications', help: 'Help & support', profile: 'Profile', signin: 'Sign in' };
  var view = function (r) {
    if (API && !API.user && PRIVATE[r.name]) { state.after = location.hash; save(); location.replace('#signin'); return ''; }
    switch (r.name) {
      case 'signin': return signin();
      case 's': return details(r.id);
      case 'pay': return pay(r.id);
      case 'qris': return qris(r.id);
      case 'done': return done(r.id);
      case 'sessions': return sessions();
      case 'host': return host();
      case 'apply': return apply();
      case 'applied': return applied();
      case 'new': return newSession();
      case 'manage': return manage(r.id);
      case 'earnings': return earnings();
      case 'rate': return rate(r.id);
      case 'notifications': return notifications();
      case 'help': return help();
      case 'profile': return profile();
      default: return weekPane();
    }
  };

  function renderWeek() {
    weekEl.innerHTML = weekHtml();
    var sc = weekEl.querySelector('.wk-scroll'), on = weekEl.querySelector('.wk-dh.on');
    if (sc && on && sc.scrollWidth > sc.clientWidth) {
      var a = sc.getBoundingClientRect(), b = on.getBoundingClientRect();
      sc.scrollLeft += (b.left + b.width / 2) - (a.left + 48 + (a.width - 48) / 2);
    }
  }
  function render(opts) {
    clearInterval(timerId);
    var html = view(current);
    if (html === '') return; // a redirect is under way
    var old = paneEl.querySelector('.p-scroll'), keep = opts && opts.keep && old ? old.scrollTop : 0;
    paneEl.innerHTML = html;
    var sc = paneEl.querySelector('.p-scroll'); if (sc) sc.scrollTop = keep;
    navEl.innerHTML = navHtml();
    renderWeek();
    if (state.lastBooked) { state.lastBooked = null; save(); }
    if (current.name === 'qris') startTimer();
    document.title = 'LearNect · ' + (TITLES[current.name] || 'Your week');
    if (!(opts && opts.keep)) {
      paneEl.classList.remove('is-new'); void paneEl.offsetWidth; paneEl.classList.add('is-new');
      var h1 = paneEl.querySelector('h1'); if (opts && opts.moved && h1) h1.focus({ preventScroll: true });
      if (narrow()) window.scrollTo(0, 0);
      else if (current.name === 'week') { var on = paneEl.querySelector('.row[aria-pressed="true"]'); if (on) on.scrollIntoView({ block: 'nearest' }); }
    }
  }
  function refreshFilters() {
    var r = document.getElementById('results'); if (r) r.innerHTML = resultsHtml();
    renderWeek();
  }

  /* ---------- Events ---------- */
  window.addEventListener('hashchange', function () { current = parse(); if (S(current.id) && inBooking()) state.pick = current.id; if (dlg.open) dlg.close(); render({ moved: true }); });

  function hoverMark(id, on) {
    var all = document.querySelectorAll('[data-sid="' + id + '"]');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-on', on || all[i].getAttribute('aria-pressed') === 'true' || all[i].hasAttribute('data-keep'));
  }
  ['mouseover', 'mouseout', 'focusin', 'focusout'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var t = e.target.closest && e.target.closest('[data-sid]'); if (!t) return;
      hoverMark(t.getAttribute('data-sid'), type === 'mouseover' || type === 'focusin');
    });
  });

  /* Create session: free time in the week is a place you can click */
  function slotAt(col, y) {
    var r = col.getBoundingClientRect(), m = START + (y - r.top) / r.height * (END - START);
    return Math.max(START, Math.min(20 * 60, END - state.nw.len, Math.floor(m / 30) * 30));
  }
  var ghost = document.createElement('div');
  ghost.className = 'slot-ghost'; ghost.setAttribute('aria-hidden', 'true');
  document.addEventListener('mousemove', function (e) {
    var col = current.name === 'new' && e.target.closest ? e.target.closest('.wk-col.can-place') : null;
    if (!col || e.target.closest('.b')) { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); return; }
    var m = slotAt(col, e.clientY);
    ghost.style.top = (m - START) / (END - START) * 100 + '%';
    ghost.style.height = state.nw.len / (END - START) * 100 + '%';
    ghost.textContent = hhmm(m);
    if (ghost.parentNode !== col) col.appendChild(ghost);
  });

  function again(t) {
    save();
    var id = t && t.id;
    render({ keep: true });
    if (id) { var el = document.getElementById(id); if (el && !el.disabled) el.focus(); }
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('.skip')) { e.preventDefault(); paneEl.focus(); return; }
    if (current.name === 'new') {
      var slot = e.target.closest('.wk-col.can-place');
      if (slot && !e.target.closest('.b')) { state.nw.day = +slot.getAttribute('data-day'); state.nw.start = hhmm(slotAt(slot, e.clientY)); save(); render({ keep: true }); return; }
    }
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act'), v = t.getAttribute('data-v'), id = t.getAttribute('data-id'), a = state.app, n = state.nw, x;
    switch (act) {
      case 'pick':
        // On a narrow screen the booking bar is far below the list, so a pick opens the session itself.
        if (current.name === 'week' && !narrow()) { state.pick = id; save(); renderWeek(); var list = paneEl.querySelectorAll('.row'); for (x = 0; x < list.length; x++) { var isMe = list[x].getAttribute('data-id') === id; list[x].setAttribute('aria-pressed', isMe); list[x].classList.remove('is-on'); } var focusBack = t.closest('#results') ? null : weekEl.querySelector('[data-sid="' + id + '"]'); if (focusBack) focusBack.focus(); }
        else location.hash = '#s/' + id;
        break;
      case 'course': state.course = v; save(); render({ keep: true }); break;
      case 'format': state.format = v; save(); render({ keep: true }); break;
      case 'clear': state.q = ''; state.course = 'all'; state.format = 'all'; state.fits = false; save(); render({ keep: true }); break;
      case 'mytab': state.mytab = v; save(); render({ keep: true }); break;
      case 'paid':
        if (busy) break;
        working(t, 'Checking payment…');
        if (API) {
          Promise.all([API.book(id), wait(900)]).then(function () { return sync(true); })
            .then(function () { busy = false; state.lastBooked = id; state.pick = id; save(); location.hash = '#done/' + id; })
            .catch(failed('Booking didn’t go through'));
          break;
        }
        setTimeout(function () { busy = false; state.booked[id] = true; delete state.cancelled[id]; state.lastBooked = id; state.pick = id; save(); location.hash = '#done/' + id; }, 900);
        break;
      case 'cancel':
        var s = S(id);
        openDialog('Cancel this booking?', '<b>' + esc(s.title) + '</b>, ' + longDate(s.day) + ' at ' + s.start + '.', (D.refundable(s.day, s.start) ? 'It’s more than 24 hours before the session, so you get a full refund of <b>' + rp(s.price) + '</b> to the account you paid from.' : 'It’s less than 24 hours before the session, so this booking can’t be refunded.'), 'Cancel booking', 'cancel-yes', id, 'Keep my seat');
        break;
      case 'cancel-yes':
        if (API) {
          if (busy) break;
          working(t, 'Cancelling…');
          API.cancel(id).then(function () { return sync(true); }).then(function () { busy = false; state.mytab = 'cancelled'; save(); dlg.close(); render({ keep: true }); }).catch(failed('Booking not cancelled'));
          break;
        }
        state.refunds = state.refunds || {}; state.refunds[id] = D.refundable(S(id).day, S(id).start) ? S(id).price : 0;
        delete state.booked[id]; state.cancelled[id] = true; state.mytab = 'cancelled'; save(); dlg.close(); render({ keep: true }); break;
      case 'dlg-close': dlg.close(); break;
      case 'reset':
        // Offline: start the demo again. With accounts: sign out, so the next visitor starts clean.
        state = fresh(); appErr = {}; nwErr = ''; authErr = ''; authNote = '';
        (API ? API.signOut().then(function () { clearServerState(); save(); return sync(true); }).catch(function () {}) : Promise.resolve()).then(function () {
          // Signing out from a private page briefly redirects to Sign in; don't send the next person back there.
          state.after = null;
          save(); if (location.hash === '#week' || !location.hash) render({ moved: true }); else location.hash = '#week';
        });
        break;
      case 'auth-mode': authMode = v; authErr = ''; authNote = ''; authVals = { name: val('au-name') || authVals.name, email: val('au-email') }; render({ keep: true }); var mb = document.getElementById('au-m-' + v); if (mb) mb.focus(); break;
      case 'auth-go': doAuth(t); break;
      case 'auth-guest':
        if (busy) break;
        working(t, 'Starting guest session…');
        API.guest().then(afterAuth).catch(function (e) { busy = false; authErr = e.message; render({ keep: true }); });
        break;
      case 'hosttab': state.hostTab = v; again(); break;
      case 'ap-course': x = a.courses.indexOf(v); if (x >= 0) a.courses.splice(x, 1); else a.courses.push(v); delete appErr.courses; again(t); break;
      case 'ap-format': a.format = v; again(t); break;
      case 'ap-transcript': a.transcript = !a.transcript; delete appErr.transcript; again(t); break;
      case 'ap-submit': submitApply(); break;
      case 'ap-approve':
        if (API) {
          if (busy) break;
          working(t, 'Approving…');
          API.approve().then(function () { return sync(true); }).then(function () { busy = false; location.hash = '#host'; }).catch(failed('Not approved'));
          break;
        }
        state.role = 'approved'; if (!state.hosted.length) state.hosted = clone(D.hostSeed); save(); location.hash = '#host'; break;
      case 'nw-course': n.course = v; again(t); break;
      case 'nw-day': n.day = +v; again(t); break;
      case 'nw-len': n.len = +v; again(t); break;
      case 'nw-format': n.format = v; again(t); break;
      case 'nw-step':
        var k = t.getAttribute('data-k'), d = +t.getAttribute('data-d');
        if (k === 'seats') n.seats = Math.max(4, Math.min(10, n.seats + d)); else n.price = Math.max(15000, Math.min(50000, n.price + d * 5000));
        again(t); break;
      case 'nw-publish': publish(); break;
      case 'host-cancel':
        var h = hosted(id);
        openDialog('Cancel this session?', '<b>' + esc(h.title) + '</b>, ' + longDate(h.day) + ' at ' + h.start + '.', h.booked ? 'All ' + plural(h.booked, 'booked student gets', 'booked students get') + ' a full refund.' : 'Nobody has booked yet.', 'Cancel session', 'host-cancel-yes', id, 'Keep session');
        break;
      case 'host-cancel-yes':
        if (API) {
          if (busy) break;
          working(t, 'Cancelling…');
          API.cancelHosted(id).then(function () { return sync(true); }).then(function () { busy = false; dlg.close(); location.hash = '#host'; }).catch(failed('Session not cancelled'));
          break;
        }
        state.hosted = state.hosted.filter(function (x) { return x.id !== id; }); save(); dlg.close(); location.hash = '#host'; break;
      case 'rate-star': case 'rate-tag': case 'rate-send':
        var r = state.ratings[id] || (state.ratings[id] = { stars: 0, tags: [], note: '', sent: false });
        if (act === 'rate-star') r.stars = +v;
        if (act === 'rate-tag') { x = r.tags.indexOf(v); if (x >= 0) r.tags.splice(x, 1); else r.tags.push(v); }
        if (act === 'rate-send') {
          if (API) {
            if (busy) break;
            working(t, 'Sending…');
            API.rate(id, r).then(function () { busy = false; r.sent = true; save(); render({ moved: true }); }).catch(failed('Rating not sent'));
            break;
          }
          r.sent = true; save(); render({ moved: true }); break;
        }
        again(t); break;
    }
  });
  document.addEventListener('input', function (e) {
    var el = e.target, k;
    if (el.id === 'q') { state.q = el.value; save(); refreshFilters(); return; }
    if (el.id === 'fits') { state.fits = el.checked; save(); refreshFilters(); return; }
    if ((k = el.getAttribute('data-ap'))) {
      state.app[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'why') { var c = document.getElementById('ap-count'); if (c) c.textContent = words(el.value); }
      if (appErr[k]) { delete appErr[k]; var w = el.closest('.field'); if (w) { w.classList.remove('has-err'); var er = w.querySelector('.err'); if (er) er.remove(); } el.removeAttribute('aria-invalid'); }
      save(); return;
    }
    if ((k = el.getAttribute('data-nw'))) {
      state.nw[k] = el.value; save();
      if (k === 'title') {
        if (nwErr) { nwErr = ''; var f = el.closest('.field'); if (f) { f.classList.remove('has-err'); var fe = f.querySelector('.err'); if (fe) fe.remove(); } el.removeAttribute('aria-invalid'); }
        renderWeek();
      }
      if (k === 'start') { var id = el.id; render({ keep: true }); var sel = document.getElementById(id); if (sel) sel.focus(); }
      return;
    }
    if ((k = el.getAttribute('data-rate'))) { var r = state.ratings[k] || (state.ratings[k] = { stars: 0, tags: [], note: '', sent: false }); r.note = el.value; save(); return; }
    if ((k = el.getAttribute('data-pref'))) { state.prefs[k] = el.checked; save(); if (API && API.user) API.prefs(state.prefs).catch(function () {}); }
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'auth-form') doAuth();
  });

  if (S(current.id) && inBooking()) state.pick = current.id;
  if (!API) { render(); return; }

  // With a backend: show the week straight away from the sample data (the same sessions and starting seats as the
  // database), then swap in the account and live seats when they arrive. Only account pages wait.
  clearServerState();
  var LOADING = '<div class="p-scroll"><div class="p-body"><p class="lede" style="display:flex;gap:10px;align-items:center"><span class="spin" aria-hidden="true"></span>Loading your week…</p></div></div>';
  var ready = false, realView = view;
  view = function (r) { return ready || !PRIVATE[r.name] && r.name !== 'signin' ? realView(r) : LOADING; };
  render();
  API.init().then(function () { return API.load(); }).then(function (d) {
    applyServer(d); ready = true;
    API.onAuth = function () { if (busy) return; if (!API.user) { clearServerState(); save(); } sync(false).catch(function () {}); };
    setInterval(function () { if (!document.hidden) sync(true).catch(function () {}); }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(true).catch(function () {}); });
    if (dlg.open || busy) return;
    render({ keep: !PRIVATE[current.name] && current.name !== 'signin' });
  }).catch(function (e) {
    if (window.console) console.warn('LearNect backend unavailable, so the site runs as the offline demo.', e);
    API = null; D.sessions = SAMPLE; EXTRA = []; ready = true; render();
  });
})();
