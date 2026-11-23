/* LearNect web demo: Book a session flow (phase 1).
   Vanilla JS, hash routes, one shared data file (data.js). */
(function () {
  'use strict';

  var D = window.LN_DATA;
  var app = document.getElementById('app');
  var ROW = 26; // px per 30 minutes; matches --row in app.css
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- State (per tab, survives refresh; the booth resets it between visitors) ---------- */
  var KEY = 'learnect-demo-v2';
  function fresh() {
    return { booked: {}, cancelled: {}, day: 5, course: 'all', format: 'all', q: '', mytab: 'upcoming', lastBooked: null,
      role: 'none', hostTab: 'upcoming', hosted: [], ratings: {}, prefs: { remind: true, fits: true },
      app: JSON.parse(JSON.stringify(D.applySeed)), nw: JSON.parse(JSON.stringify(D.newSessionSeed)) };
  }
  var state = (function () {
    try { var s = JSON.parse(sessionStorage.getItem(KEY)); if (s && s.booked) return s; } catch (e) {}
    return fresh();
  })();
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Helpers ---------- */
  var DAY_S = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_L = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var weekStart = new Date(D.WEEK_START + 'T00:00:00');

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mins(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  function dateOf(day) { var d = new Date(weekStart); d.setDate(d.getDate() + day); return d; }
  function dayNum(day) { return dateOf(day).getDate(); }
  function longDate(day) { var d = dateOf(day); return DAY_L[day] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function shortDate(day) { var d = dateOf(day); return DAY_S[day] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function rp(n) { return 'Rp' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function rpShort(n) { return 'Rp' + Math.round(n / 1000) + 'k'; }

  function S(id) { for (var i = 0; i < D.sessions.length; i++) if (D.sessions[i].id === id) return D.sessions[i]; return null; }
  function C(s) { return D.courses[s.course]; }
  function M(s) { return D.mentors[s.mentor]; }
  function isBooked(s) { return !!state.booked[s.id]; }
  function taken(s) { return s.booked + (isBooked(s) ? 1 : 0); }
  function left(s) { return Math.max(0, s.seats - taken(s)); }
  function isFull(s) { return left(s) === 0 && !isBooked(s); }
  function classesOn(day) {
    var list = D.classes.filter(function (c) { return c.day === day; });
    if (state.role === 'approved') state.hosted.forEach(function (h) {
      if (h.day === day) list.push({ day: h.day, start: h.start, end: h.end, course: h.course, room: h.type === 'online' ? 'Online' : h.place.split(',')[0], title: h.title, teaching: true, hostId: h.id });
    });
    return list;
  }
  function clashOf(s) {
    var a = mins(s.start), b = mins(s.end);
    var hit = null;
    classesOn(s.day).forEach(function (c) { if (mins(c.start) < b && mins(c.end) > a) hit = c; });
    return hit;
  }
  function blockColour(s) { return isBooked(s) ? 'sun' : (isFull(s) ? 'full' : C(s).colour); }
  function bookingCode(s) { var h = 0; for (var i = 0; i < s.id.length; i++) h = (h * 31 + s.id.charCodeAt(i)) % 9000; return 'LN-' + (1000 + h); }

  function cells(s, lg) {
    var out = '<span class="cells' + (lg ? ' lg' : '') + '" aria-hidden="true">';
    var t = taken(s);
    for (var i = 0; i < s.seats; i++) out += '<i' + (i < t ? ' class="f"' : '') + '></i>';
    return out + '</span>';
  }
  function seatsText(s) {
    if (isBooked(s)) return 'You have a seat';
    var l = left(s);
    return l === 0 ? 'Full' : (l + ' of ' + s.seats + ' seats left');
  }

  /* ---------- Icons (one stroke family, 2px) ---------- */
  function ic(name) {
    var p = {
      home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
      host: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
      cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
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
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ---------- Shared pieces ---------- */
  function tabbar(active) {
    var tabs = [['home', 'Home', 'home'], ['explore', 'Explore', 'search'], ['host', 'Host', 'host'], ['sessions', 'Sessions', 'cal'], ['profile', 'Profile', 'user']];
    return '<nav class="tabbar" aria-label="Main">' + tabs.map(function (t) {
      return '<a class="tab" href="#' + t[0] + '"' + (t[0] === active ? ' aria-current="page"' : '') + '>' + ic(t[2]) + t[1] + '</a>';
    }).join('') + '</nav>';
  }
  function topBrand() {
    return '<header class="top pad"><div class="brand"><img src="assets/logo.svg?v=2" alt="">LearNect<span class="demo-mark">Demo · sample data</span></div>' +
      '<a class="icon-btn" href="#notifications" aria-label="Notifications">' + ic('bell') + '</a></header>';
  }
  function bar(title, left, right) {
    return '<header class="bar pad">' + (left || '<span></span>') + '<h1 tabindex="-1">' + esc(title) + '</h1>' + (right || '<span></span>') + '</header>';
  }
  function backBtn() { return '<button class="icon-btn plain" type="button" aria-label="Back" data-act="back">' + ic('back') + '</button>'; }

  function band(s, big) {
    var col = blockColour(s) === 'full' ? C(s).colour : blockColour(s);
    var meta = (isBooked(s) ? 'Booked · ' : '') + C(s).name + ' · ' + s.format.label + ' · ' + M(s).name;
    return '<div class="band-wrap pad"><div class="band ' + col + (big ? ' big' : '') + '">' +
      '<div class="time num">' + s.start + '<span>' + s.end + '</span></div>' +
      '<div><div class="t">' + esc(s.title) + '</div><div class="d">' + longDate(s.day) + '</div><div class="d">' + esc(meta) + '</div></div>' +
      '</div></div>';
  }

  /* ---------- Home: your week with free gaps ---------- */
  function freeGaps(day) {
    var dayStart = 7 * 60, dayEnd = 21 * 60;
    var cls = classesOn(day).map(function (c) { return [mins(c.start), mins(c.end)]; }).sort(function (a, b) { return a[0] - b[0]; });
    var gaps = [], cur = dayStart;
    cls.forEach(function (c) { if (c[0] > cur) gaps.push([cur, c[0]]); cur = Math.max(cur, c[1]); });
    if (cur < dayEnd) gaps.push([cur, dayEnd]);
    return gaps;
  }
  function gapLabel(g, day) {
    var hasClasses = classesOn(day).length > 0;
    if (!hasClasses) return 'No classes · free all day';
    if (g[1] >= 21 * 60) return 'Free after ' + hhmm(g[0]);
    if (g[0] <= 7 * 60) return 'Free until ' + hhmm(g[1]);
    return 'Free ' + hhmm(g[0]) + '–' + hhmm(g[1]);
  }

  function home() {
    var day = state.day;
    var cls = classesOn(day);
    var daySessions = D.sessions.filter(function (s) { return s.day === day; }).sort(function (a, b) { return mins(a.start) - mins(b.start); });
    var shown = daySessions.filter(function (s) { return !clashOf(s) && (!isFull(s) || isBooked(s)); });
    var others = daySessions.filter(function (s) { return shown.indexOf(s) < 0; });
    var fitting = shown.filter(function (s) { return !isBooked(s); });
    var mine = shown.filter(isBooked);

    // Visible window
    var starts = cls.map(function (c) { return mins(c.start); }).concat(shown.map(function (s) { return mins(s.start); }));
    var ends = cls.map(function (c) { return mins(c.end); }).concat(shown.map(function (s) { return mins(s.end); }));
    var w0 = starts.length ? Math.floor(Math.min.apply(null, starts) / 60) * 60 : 9 * 60;
    var w1 = ends.length ? Math.ceil(Math.max.apply(null, ends) / 60) * 60 : 17 * 60;
    if (w1 - w0 < 6 * 60) w1 = w0 + 6 * 60;
    function y(m) { return (m - w0) / 30 * ROW; }

    var html = '';
    for (var h = w0; h < w1; h += 60) html += '<span class="tm" style="top:' + y(h) + 'px">' + hhmm(h) + '</span>';
    cls.forEach(function (c) {
      var top = y(mins(c.start)), hgt = y(mins(c.end)) - top - 3;
      html += c.teaching
        ? '<a class="lane cls teaching" href="#manage/' + c.hostId + '" style="top:' + top + 'px;height:' + hgt + 'px"><b>' + esc(c.title) + '</b><span class="meta">You’re teaching · ' + esc(c.room) + '</span></a>'
        : '<div class="lane cls" style="top:' + top + 'px;height:' + hgt + 'px"><b>' + esc(c.title) + '</b><span class="meta">Your class · ' + esc(c.room) + '</span></div>';
    });

    var gaps = freeGaps(day), headLabel = '';
    gaps.forEach(function (g) {
      var inGap = shown.filter(function (s) { return mins(s.start) >= g[0] && mins(s.end) <= g[1]; });
      if (!inGap.length) return;
      var a = Math.max(g[0], w0), b = Math.min(g[1], w1);
      html += '<div class="lane free" style="top:' + (y(a) + 1) + 'px;height:' + (y(b) - y(a) - 4) + 'px" aria-hidden="true"></div>';
      if (!headLabel) headLabel = gapLabel(g, day);
      // Columns for overlapping sessions
      var colEnds = [];
      inGap.forEach(function (s) {
        var col = 0; while (colEnds[col] && colEnds[col] > mins(s.start)) col++;
        colEnds[col] = mins(s.end); s._col = col;
      });
      var ncol = Math.max(1, colEnds.length);
      inGap.forEach(function (s) {
        var top = y(mins(s.start)) + 3, hgt = y(mins(s.end)) - y(mins(s.start)) - 6;
        var wPct = 100 / ncol;
        var style = 'top:' + top + 'px;height:' + hgt + 'px;left:calc(54px + (100% - 62px) * ' + (s._col * wPct / 100) + ');width:calc((100% - 62px) * ' + (wPct / 100) + ' - ' + (ncol > 1 ? 4 : 0) + 'px)';
        var drop = state.lastBooked === s.id && !reduceMotion ? ' drop' : '';
        html += '<a class="blk-link' + drop + '" href="#s/' + s.id + '" style="' + style + '" aria-label="' + esc(s.title + ', ' + s.start + ' to ' + s.end + (isBooked(s) ? ', booked' : ', ' + rp(s.price))) + '">' +
          '<div class="blk ' + blockColour(s) + (hgt <= 60 ? ' short' : '') + '"><span class="time">' + s.start + '</span>' +
          '<span class="t"><span class="tt-title">' + esc(s.title) + '</span>' + (hgt > 60 ? '<span class="who">' + esc(M(s).name + ' · ' + s.format.label) + '</span>' : '') + (!isBooked(s) ? '<span style="display:block">' + cells(s) + '</span>' : '') + '</span>' +
          '<span class="p">' + (isBooked(s) ? 'Booked' : rpShort(s.price) + (left(s) <= 3 ? '<br>' + left(s) + ' left' : '')) + '</span></div></a>';
      });
    });

    var subline;
    if (mine.length) subline = 'You’re booked for ' + esc(mine[0].title) + ' at ' + mine[0].start + '.' + (fitting.length ? ' ' + fitting.length + ' more ' + (fitting.length === 1 ? 'session fits' : 'sessions fit') + ' your gaps.' : '');
    else if (fitting.length) subline = DAY_L[day] + (cls.length ? ' has a free gap after your class. ' : ' is free all day. ') + fitting.length + ' ' + (fitting.length === 1 ? 'session fits' : 'sessions fit') + ' in it.';
    else subline = 'No peer sessions fit your free time on ' + DAY_L[day] + '. Try the weekend.';

    var strip = '<div class="days" role="group" aria-label="Choose a day">' + DAY_S.map(function (n, i) {
      var has = D.sessions.some(function (s) { return s.day === i && !clashOf(s) && (!isFull(s) || isBooked(s)); });
      var my = D.sessions.some(function (s) { return s.day === i && isBooked(s); });
      return '<button type="button" class="day' + (i === D.TODAY_INDEX ? ' today' : '') + '" aria-pressed="' + (i === day) + '" data-act="day" data-day="' + i + '" aria-label="' + longDate(i) + (i === D.TODAY_INDEX ? ', today' : '') + '">' + n + '<b class="num">' + dayNum(i) + '</b>' + (my ? '<span class="dot mine"></span>' : (has ? '<span class="dot"></span>' : '')) + '</button>';
    }).join('') + '</div>';

    var ttHeight = (w1 - w0) / 30 * ROW;
    var body =
      '<div class="pad greet"><h1 class="title-xl" tabindex="-1">Hi, ' + esc(D.user.name) + '</h1><p class="sub">' + subline + '</p></div>' +
      strip +
      '<div class="pad">' +
      '<div class="dayhead"><h2>' + longDate(day) + '</h2><span>' + (headLabel || (cls.length ? 'Your classes' : 'No classes')) + '</span></div>' +
      '<div class="tt" style="height:' + ttHeight + 'px">' + html + '</div>';

    if (!shown.length) {
      body += '<div class="empty"><b>Nothing fits ' + DAY_L[day] + ' yet</b><p>Peer sessions this week are mostly on the weekend. Pick Saturday or browse everything.</p>' +
        '<button class="btn btn-secondary" type="button" data-act="day" data-day="5">Show Saturday</button></div>';
    }
    if (others.length) {
      body += '<div class="sec"><h2>Also on ' + DAY_L[day] + '</h2><span>Don’t fit right now</span></div><div class="list">' + others.map(listBlock).join('') + '</div>';
    }
    body += '<div class="sec"><h2>Not seeing your course?</h2></div><a class="btn btn-secondary btn-block" href="#explore">Browse all sessions</a><div style="height:24px"></div></div>';

    if (state.lastBooked) { var lb = state.lastBooked; setTimeout(function () { if (state.lastBooked === lb) { state.lastBooked = null; save(); } }, 900); }
    return '<div class="screen">' + topBrand() + body + '</div>' + tabbar('home');
  }

  function listBlock(s) {
    var clash = clashOf(s);
    var col = blockColour(s);
    var reason = isBooked(s) ? '<span class="reason">' + ic('check').replace('<svg', '<svg width="14" height="14"') + 'Booked</span>'
      : isFull(s) ? '<span class="reason">Full</span>'
      : clash ? '<span class="reason">Clashes with your ' + clash.start + ' class</span>'
      : '<span class="reason">Fits your free time</span>';
    return '<a class="blk-link" href="#s/' + s.id + '"><div class="blk ' + col + '">' +
      '<div class="time num">' + s.start + '<span>' + s.end + '</span></div>' +
      '<div><div class="t">' + esc(s.title) + '</div>' +
      '<div class="meta">' + esc(C(s).name + ' · ' + M(s).name + ' · ' + (s.format.type === 'online' ? 'Online' : s.format.place.split(',')[1].trim())) + '</div>' +
      '<div class="foot">' + reason + '<span class="num">' + rp(s.price) + '</span></div>' +
      (isBooked(s) || isFull(s) ? '' : '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;font-weight:600;margin-top:6px">' + cells(s) + '<span>' + seatsText(s) + '</span></div>') +
      '</div></div></a>';
  }

  /* ---------- Explore ---------- */
  function exploreResults() {
    var q = state.q.trim().toLowerCase();
    var list = D.sessions.filter(function (s) {
      if (state.course !== 'all' && s.course !== state.course) return false;
      if (state.format !== 'all' && s.format.type !== state.format) return false;
      if (q && (s.title + ' ' + C(s).name + ' ' + C(s).code + ' ' + M(s).name).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return a.day - b.day || mins(a.start) - mins(b.start); });
    if (!list.length) {
      return '<div class="empty"><b>No sessions match</b><p>' + (q ? 'Nothing for “' + esc(state.q) + '” with these filters.' : 'Nothing with these filters this week.') + '</p>' +
        '<button class="btn btn-secondary" type="button" data-act="clear">Clear filters</button></div>';
    }
    var out = '', lastDay = -1;
    list.forEach(function (s) {
      if (s.day !== lastDay) { out += (lastDay >= 0 ? '</div>' : '') + '<div class="sec"><h2>' + longDate(s.day) + '</h2></div><div class="list">'; lastDay = s.day; }
      out += listBlock(s);
    });
    return out + '</div>';
  }
  function explore() {
    var chips = [['all', 'All', null]].concat(Object.keys(D.courses).map(function (k) { return [k, D.courses[k].name, D.courses[k].colour]; }));
    return '<div class="screen">' +
      '<header class="top pad"><h1 class="title-xl" tabindex="-1">Explore</h1></header>' +
      '<div class="pad"><label class="search"><span class="vh">Search sessions</span>' + ic('search') +
      '<input id="q" type="search" placeholder="Course, topic or mentor" value="' + esc(state.q) + '" enterkeyhint="search" autocomplete="off"></label></div>' +
      '<div class="chips" role="group" aria-label="Course">' + chips.map(function (c) {
        return '<button type="button" class="chip" aria-pressed="' + (state.course === c[0]) + '" data-act="course" data-v="' + c[0] + '">' + (c[2] ? '<i style="background:var(--' + c[2] + ')"></i>' : '') + esc(c[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="pad" style="margin-top:10px"><div class="seg" role="group" aria-label="Format">' +
      [['all', 'All'], ['online', 'Online'], ['onsite', 'On-site']].map(function (f) {
        return '<button type="button" aria-pressed="' + (state.format === f[0]) + '" data-act="format" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div>' +
      '<div id="results">' + exploreResults() + '</div><div style="height:24px"></div></div>' +
      '</div>' + tabbar('explore');
  }

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

  /* ---------- Session details ---------- */
  function details(id) {
    var s = S(id); if (!s) return notFound();
    var m = M(s), clash = clashOf(s);
    var fit = isBooked(s)
      ? '<div class="fit" style="border-color:var(--sun);border-style:solid;background:#FFF8E1">' + ic('check') + '<span>You’re booked. It’s in your week and in My Sessions.</span></div>'
      : clash
        ? '<div class="fit clash">' + ic('warn') + '<span>Clashes with your class <b>' + esc(clash.title) + '</b> (' + clash.start + '–' + clash.end + ').</span></div>'
        : '<div class="fit">' + ic('gap') + '<span>' + fitText(s) + '</span></div>';
    var place = s.format.type === 'online' ? ic('video') : ic('pin');
    var action;
    if (isBooked(s)) action = '<a class="btn btn-primary" href="#sessions">View in My Sessions</a>';
    else if (isFull(s)) action = '<button class="btn" type="button" disabled>Session full</button>';
    else action = '<a class="btn btn-primary" href="#pay/' + s.id + '">Book session</a>';

    return '<div class="screen">' + bar('Session', backBtn()) + band(s, true) +
      '<div class="pad">' +
      '<p>' + esc(s.blurb) + '</p>' +
      '<div class="seats-line">' + cells(s, true) + '<span>' + seatsText(s) + '</span></div>' +
      '<div style="margin-top:16px">' + fit + '</div>' +
      '<div class="sec"><h2>Where</h2></div>' +
      '<div class="card place"><span class="ic">' + place + '</span><div><b>' + esc(s.format.place) + '</b><p>' + esc(s.format.detail) + '</p></div></div>' +
      '<div class="sec"><h2>Your mentor</h2></div>' +
      '<div class="card"><div class="mentor"><span class="avatar" aria-hidden="true">' + m.initial + '</span><div><b>' + esc(m.full) + '</b><div class="meta">Peer mentor · ' + esc(m.major) + '</div><div class="meta num">' + ic('star').replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"') + ' ' + m.rating.toFixed(1) + ' · ' + m.sessions + ' sessions taught</div></div></div>' +
      '<p class="quote">“' + esc(m.quote) + '”</p></div>' +
      '<div class="sec"><h2>What you’ll learn</h2></div><ul class="checks">' + s.learn.map(function (l) { return '<li><span class="box">' + ic('check') + '</span>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<div class="sec"><h2>Come prepared</h2></div><ul class="checks plain">' + s.bring.map(function (l) { return '<li><span class="box"></span>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<div class="sec"><h2>Before you book</h2></div><div class="note">' + ic('info') + '<span>' + esc(D.refundRule) + '</span></div>' +
      '<div style="height:20px"></div></div></div>' +
      '<div class="action pad"><div class="price"><b>' + rp(s.price) + '</b><span>per person</span></div>' + action + '</div>';
  }

  /* ---------- Review & pay ---------- */
  function pay(id) {
    var s = S(id); if (!s) return notFound();
    if (isBooked(s)) { location.replace('#done/' + s.id); return ''; }
    return '<div class="screen">' + bar('Review & pay', backBtn()) + band(s) +
      '<div class="pad">' +
      '<div class="sec" style="margin-top:8px"><h2>Price</h2></div>' +
      '<div class="card"><div class="row-line"><span class="k">Session, 1 seat</span><span>' + rp(s.price) + '</span></div>' +
      '<div class="row-line total"><span>Total</span><span>' + rp(s.price) + '</span></div></div>' +
      '<div class="sec"><h2>Pay with</h2></div>' +
      '<div class="radio" role="radio" aria-checked="true"><span class="dot"></span><div><b>QRIS</b><span>Scan with any banking or e-wallet app</span></div><span class="tag">Selected</span></div>' +
      '<div class="sec"><h2>Cancellation</h2></div><div class="note">' + ic('info') + '<span>' + esc(D.refundRule) + '</span></div>' +
      '<div style="height:20px"></div></div></div>' +
      '<div class="action pad"><div class="price"><b>' + rp(s.price) + '</b><span>Total</span></div><a class="btn btn-primary" href="#qris/' + s.id + '">Pay ' + rp(s.price) + '</a></div>';
  }

  /* ---------- QRIS (simulated) ---------- */
  function qrSvg(seed) {
    var n = 25, cell = 8, x, yy, h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    function rnd() { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; }
    function finder(fx, fy) {
      return '<rect x="' + fx * cell + '" y="' + fy * cell + '" width="' + 7 * cell + '" height="' + 7 * cell + '" fill="#1B2340"/>' +
        '<rect x="' + (fx + 1) * cell + '" y="' + (fy + 1) * cell + '" width="' + 5 * cell + '" height="' + 5 * cell + '" fill="#fff"/>' +
        '<rect x="' + (fx + 2) * cell + '" y="' + (fy + 2) * cell + '" width="' + 3 * cell + '" height="' + 3 * cell + '" fill="#1B2340"/>';
    }
    var out = '<svg class="qr" viewBox="0 0 ' + n * cell + ' ' + n * cell + '" role="img" aria-label="Demo QR code. It is not a real payment code.">';
    for (yy = 0; yy < n; yy++) for (x = 0; x < n; x++) {
      var inFinder = (x < 8 && yy < 8) || (x > n - 9 && yy < 8) || (x < 8 && yy > n - 9);
      var inLogo = x > 9 && x < 15 && yy > 9 && yy < 15;
      if (!inFinder && !inLogo && rnd() > 0.52) out += '<rect x="' + x * cell + '" y="' + yy * cell + '" width="' + cell + '" height="' + cell + '" fill="#1B2340"/>';
    }
    out += finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7);
    out += '<g transform="translate(' + (10.4 * cell) + ' ' + (10.4 * cell) + ') scale(' + (4.2 * cell / 104) + ')"><path d="M0 18A18 18 0 0 1 18 0H57A4 4 0 0 1 61 4V30A13 13 0 0 0 74 43H100A4 4 0 0 1 104 47V86A18 18 0 0 1 86 104H18A18 18 0 0 1 0 86Z" fill="#1B2340"/><path d="M68 6A6 6 0 0 1 74 0H98A6 6 0 0 1 104 6V30A6 6 0 0 1 98 36H74A6 6 0 0 1 68 30Z" fill="#FFC531"/><path d="M18 22.5A2.5 2.5 0 0 1 20.5 20H41.5A2.5 2.5 0 0 1 44 22.5V57.5A2.5 2.5 0 0 0 46.5 60H81.5A2.5 2.5 0 0 1 84 62.5V83.5A2.5 2.5 0 0 1 81.5 86H20.5A2.5 2.5 0 0 1 18 83.5Z" fill="#FBFBF7"/></g>';
    return out + '</svg>';
  }
  var timerId = null;
  function qris(id) {
    var s = S(id); if (!s) return notFound();
    if (isBooked(s)) { location.replace('#done/' + s.id); return ''; }
    return '<div class="screen">' + bar('Pay with QRIS', backBtn()) + band(s) +
      '<div class="pad"><div class="qr-card">' +
      '<div class="qr-head"><span>QRIS</span><span class="demo-flag">' + ic('info').replace('<svg', '<svg width="14" height="14"') + 'Demo · no money is charged</span></div>' +
      qrSvg(s.id) +
      '<div class="amount">' + rp(s.price) + '</div>' +
      '<p class="sub">Scan with any banking or e-wallet app that supports QRIS.</p>' +
      '<p>Expires in <span class="timer" id="timer">10:00</span></p>' +
      '</div><div style="height:20px"></div></div></div>' +
      '<div class="action pad"><button class="btn btn-primary" type="button" data-act="paid" data-id="' + s.id + '">I’ve paid</button></div>';
  }
  function startTimer() {
    var el = document.getElementById('timer'); if (!el) return;
    var t = 600;
    timerId = setInterval(function () {
      t = Math.max(0, t - 1);
      el.textContent = Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2);
      if (!t) clearInterval(timerId);
    }, 1000);
  }

  /* ---------- Booking confirmed ---------- */
  function done(id) {
    var s = S(id); if (!s) return notFound();
    if (!isBooked(s)) { location.replace('#s/' + s.id); return ''; }
    var m = M(s);
    var how = s.format.type === 'online'
      ? 'Your Google Meet link appears in My Sessions 15 minutes before the start.'
      : s.format.detail;
    return '<div class="screen">' + bar('Booking confirmed', '<span></span>', '<a class="icon-btn plain" href="#home" aria-label="Close">' + ic('close') + '</a>') +
      '<div class="pad done-hero"><p class="title-xl">You’re booked</p><p class="sub">' + esc(m.name) + ' will see you on ' + DAY_L[s.day] + '. It’s now in your week, in yellow.</p></div>' +
      band(s, true) +
      '<div class="pad"><div class="card">' +
      '<div class="row-line"><span class="k">Date</span><span>' + longDate(s.day) + '</span></div>' +
      '<div class="row-line"><span class="k">Time</span><span>' + s.start + '–' + s.end + '</span></div>' +
      '<div class="row-line"><span class="k">Where</span><span style="text-align:right">' + esc(s.format.place) + '</span></div>' +
      '<div class="row-line"><span class="k">Paid with QRIS</span><span>' + rp(s.price) + '</span></div>' +
      '<div class="row-line"><span class="k">Booking code</span><span>' + bookingCode(s) + '</span></div></div>' +
      '<div class="note" style="margin-top:10px">' + ic(s.format.type === 'online' ? 'video' : 'pin') + '<span>' + esc(how) + '</span></div>' +
      '<div class="stack" style="margin-top:18px"><a class="btn btn-primary btn-block" href="#home" data-act="see-week" data-day="' + s.day + '">See it in your week</a>' +
      '<a class="btn btn-secondary btn-block" href="#sessions">My Sessions</a></div><div style="height:24px"></div></div></div>';
  }

  /* ---------- My Sessions ---------- */
  function sessions() {
    var up = D.sessions.filter(isBooked).sort(function (a, b) { return a.day - b.day || mins(a.start) - mins(b.start); });
    var can = D.sessions.filter(function (s) { return state.cancelled[s.id] && !isBooked(s); });
    var tabs = [['upcoming', 'Upcoming (' + up.length + ')'], ['past', 'Past'], ['cancelled', 'Cancelled' + (can.length ? ' (' + can.length + ')' : '')]];
    var body = '';
    if (state.mytab === 'upcoming') {
      body = up.length ? '<div class="list">' + up.map(function (s) {
        var online = s.format.type === 'online';
        return '<div class="my-blk"><div class="head"><div class="time num">' + s.start + '<span>' + shortDate(s.day) + '</span></div>' +
          '<div><div class="t">' + esc(s.title) + '</div><div class="meta">' + esc(C(s).name + ' · ' + M(s).name + ' · ' + s.format.place) + '</div></div></div>' +
          '<div class="acts">' + (online
            ? '<button class="btn btn-secondary" type="button" aria-disabled="true" data-act="noop">' + ic('video').replace('<svg', '<svg width="18" height="18"') + 'Join Google Meet</button>'
            : '<span class="hint">' + ic('pin').replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"') + ' ' + esc(s.format.place.split(',')[0]) + '</span>') +
          '<button class="link-btn" type="button" data-act="cancel" data-id="' + s.id + '">Cancel</button></div>' +
          (online ? '<span class="hint">The link opens 15 minutes before the start.</span>' : '') + '</div>';
      }).join('') + '</div>'
        : '<div class="empty"><b>No upcoming sessions</b><p>Saturday has a free gap after your class, and sessions fit in it.</p><a class="btn btn-primary" href="#home" data-act="see-week" data-day="5">See what fits</a></div>';
    } else if (state.mytab === 'past') {
      body = '<div class="list">' + D.past.map(function (p) {
        var r = state.ratings[p.id], done = r && r.sent;
        return '<div class="my-blk past"><div class="head"><div class="time num">' + p.start + '<span>' + esc(p.date) + '</span></div><div><div class="t">' + esc(p.title) + '</div><div class="meta">' + esc(D.courses[p.course].name + ' · ' + D.mentors[p.mentor].name) + '</div></div></div>' +
          (done ? '<span class="hint">You rated this ' + r.stars + ' out of 5. Thanks.</span>' : '<a class="btn btn-secondary" href="#rate/' + p.id + '">Rate this session</a>') + '</div>';
      }).join('') + '</div>';
    } else {
      body = can.length ? '<div class="list">' + can.map(function (s) {
        return '<div class="my-blk cancelled"><div class="head"><div class="time num">' + s.start + '<span>' + shortDate(s.day) + '</span></div><div><div class="t">' + esc(s.title) + '</div><div class="meta">Cancelled · ' + rp(s.price) + ' refunded</div></div></div></div>';
      }).join('') + '</div>' : '<div class="empty"><b>Nothing cancelled</b><p>Cancelled bookings and their refunds appear here.</p></div>';
    }
    return '<div class="screen"><header class="top pad"><h1 class="title-xl" tabindex="-1">My Sessions</h1></header>' +
      '<div class="pad"><div class="seg" role="group" aria-label="Show">' + tabs.map(function (t) {
        return '<button type="button" aria-pressed="' + (state.mytab === t[0]) + '" data-act="mytab" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div style="height:16px"></div>' + body + '<div style="height:24px"></div></div></div>' + tabbar('sessions');
  }

  function cancelSheet(id) {
    var s = S(id);
    var wrap = document.createElement('div');
    wrap.className = 'scrim';
    wrap.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><span class="grab" aria-hidden="true"></span>' +
      '<h2 id="cancel-title">Cancel this booking?</h2>' +
      '<p><b>' + esc(s.title) + '</b>, ' + longDate(s.day) + ' at ' + s.start + '.</p>' +
      '<div class="note">' + ic('info') + '<span>It’s more than 24 hours before the session, so you get a full refund of <b>' + rp(s.price) + '</b> to the account you paid from.</span></div>' +
      '<button class="btn btn-primary btn-block" type="button" data-act="cancel-yes" data-id="' + s.id + '">Cancel booking</button>' +
      '<button class="btn btn-secondary btn-block" type="button" data-act="sheet-close">Keep my seat</button></div>';
    app.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('open'); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSheet(); });
    var first = wrap.querySelector('[data-act="sheet-close"]'); if (first) first.focus();
  }
  function closeSheet() {
    var w = app.querySelector('.scrim'); if (!w) return;
    w.classList.remove('open');
    setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 220);
  }

  /* ---------- Shared form pieces ---------- */
  function field(id, label, control, err, hint) {
    return '<div class="field' + (err ? ' has-err' : '') + '"><label for="' + id + '">' + label + '</label>' + control +
      (hint ? '<p class="hint" id="' + id + '-hint">' + hint + '</p>' : '') +
      (err ? '<p class="err" id="' + id + '-err">' + ic('warn') + '<span>' + esc(err) + '</span></p>' : '') + '</div>';
  }
  function words(s) { return String(s).trim().split(/\s+/).filter(Boolean).length; }
  function share(n) { return Math.round(n * (1 - D.commission)); }
  function hosted(id) { for (var i = 0; i < state.hosted.length; i++) if (state.hosted[i].id === id) return state.hosted[i]; return null; }
  function liveHosted() { return state.hosted.slice().sort(function (a, b) { return a.day - b.day || mins(a.start) - mins(b.start); }); }
  function projected() { return liveHosted().reduce(function (t, h) { return t + share(h.booked * h.price); }, 0); }
  function seatCells(taken, seats, lg) {
    var out = '<span class="cells' + (lg ? ' lg' : '') + '" aria-hidden="true">';
    for (var i = 0; i < seats; i++) out += '<i' + (i < taken ? ' class="f"' : '') + '></i>';
    return out + '</span>';
  }
  function hostBand(h) {
    return '<div class="band-wrap pad"><div class="band big ' + D.courses[h.course].colour + '"><div class="time num">' + h.start + '<span>' + h.end + '</span></div>' +
      '<div><div class="t">' + esc(h.title) + '</div><div class="d">' + longDate(h.day) + '</div><div class="d">' + esc(D.courses[h.course].name + ' · ' + (h.type === 'online' ? 'Online' : 'On-site')) + '</div></div></div></div>';
  }

  /* A slice of one day on the timetable: classes, teaching, your bookings and one proposed session. */
  function daySlice(day, prop) {
    var items = classesOn(day).map(function (c) { return { a: mins(c.start), b: mins(c.end), kind: c.teaching ? 'teach' : 'class', t: c.title }; })
      .concat(D.sessions.filter(function (s) { return s.day === day && isBooked(s); }).map(function (s) { return { a: mins(s.start), b: mins(s.end), kind: 'mine', t: s.title }; }));
    var all = items.concat([prop]);
    var w0 = Math.floor(Math.min.apply(null, all.map(function (x) { return x.a; })) / 60) * 60;
    var w1 = Math.ceil(Math.max.apply(null, all.map(function (x) { return x.b; })) / 60) * 60;
    if (w1 - w0 < 240) w1 = w0 + 240;
    var rows = (w1 - w0) / 30, row = 16, html = '';
    function y(m) { return (m - w0) / 30 * row; }
    for (var h = w0; h < w1; h += 60) html += '<span class="sl-hr" style="top:' + y(h) + 'px">' + hhmm(h) + '</span>';
    var hit = false;
    items.forEach(function (it) {
      var overlaps = it.a < prop.b && it.b > prop.a;
      if (overlaps) hit = true;
      html += '<div class="sl sl-' + it.kind + (overlaps ? ' is-split' : '') + '" style="top:' + (y(it.a) + 1) + 'px;height:' + (y(it.b) - y(it.a) - 2) + 'px"><span>' + esc(it.t) + '</span></div>';
    });
    html += '<div class="sl sl-new ' + D.courses[prop.course].colour + (hit ? ' is-clash' : '') + '" style="top:' + (y(prop.a) + 1) + 'px;height:' + (y(prop.b) - y(prop.a) - 2) + 'px"><b>' + hhmm(prop.a) + '</b><span>' + esc(prop.title || 'Your session') + '</span></div>';
    return '<div class="slice" role="img" aria-label="' + esc(DAY_L[day] + ' timetable with the session at ' + hhmm(prop.a) + (hit ? ', clashing with something already there' : ', in free time')) + '" style="height:' + rows * row + 'px;background-size:100% ' + row + 'px">' + html + '</div>';
  }

  /* ---------- Host: pitch, status or dashboard ---------- */
  function host() {
    if (state.role === 'approved') return hostDash();
    if (state.role === 'review') return hostReview();
    return '<div class="screen"><header class="top pad"><h1 class="title-xl" tabindex="-1">Teach a course you aced</h1></header><div class="pad">' +
      '<p class="sub">Keep 80% of every booking, in your own free time.</p>' +
      '<div class="pitch-week"><div class="sec" style="margin-top:0"><h2>Alex’s Friday</h2><span>Example</span></div>' +
      daySlice(4, { a: 15 * 60, b: 16 * 60 + 30, course: 'prog', title: 'Arrays & Strings' }) + '</div>' +
      '<div class="card" style="margin-top:12px"><div class="split-seats">' + seatCells(6, 6, true) + '<span>6 students × Rp25.000</span></div>' +
      '<div class="row-line"><span class="k">LearNect’s 20%</span><span>Rp30.000</span></div>' +
      '<div class="row-line total"><span>You keep</span><span>Rp120.000</span></div></div>' +
      '<div class="sec"><h2>How it works</h2></div><ol class="steps-list">' +
      '<li><b>Apply with your transcript</b><span>Tell us which courses you can teach and how.</span></li>' +
      '<li><b>Get approved</b><span>We review your grades and your answers.</span></li>' +
      '<li><b>Publish sessions in your free time</b><span>LearNect checks each one against your week.</span></li></ol>' +
      '<div style="height:20px"></div></div></div>' +
      '<div class="action pad"><a class="btn btn-primary" href="#apply">Apply to teach</a></div>' + tabbar('host');
  }
  function hostReview() {
    return '<div class="screen"><header class="top pad"><h1 class="title-xl" tabindex="-1">Host</h1></header><div class="pad">' +
      '<div class="empty"><b>Your application is under review</b><p>You can keep booking sessions while we check it. Publishing unlocks once you’re approved.</p>' +
      '<a class="btn btn-secondary" href="#applied">See application</a></div></div></div>' + tabbar('host');
  }
  function hostBlock(h) {
    return '<a class="blk-link" href="#manage/' + h.id + '"><div class="blk ' + D.courses[h.course].colour + '"><div class="time num">' + h.start + '<span>' + DAY_S[h.day] + ' ' + dayNum(h.day) + '</span></div>' +
      '<div><div class="t">' + esc(h.title) + '</div><div class="meta">' + esc(D.courses[h.course].code + ' · ' + (h.type === 'online' ? 'Online' : h.place.split(',')[0])) + '</div>' +
      '<div class="foot">' + seatCells(h.booked, h.seats) + '<span class="num">' + h.booked + ' × ' + rp(h.price) + '</span></div>' +
      '<div class="foot"><span>You keep</span><span class="num">' + rp(share(h.booked * h.price)) + '</span></div></div></div></a>';
  }
  function hostDash() {
    var list = liveHosted(), body;
    if (state.hostTab === 'past') {
      body = '<div class="empty"><b>No completed sessions yet</b><p>Finished sessions appear here with what you earned from each.</p></div>';
    } else if (!list.length) {
      body = '<div class="empty"><b>No sessions yet</b><p>Publish your first session in a free slot.</p></div>';
    } else {
      body = '<div class="list">' + list.map(hostBlock).join('') + '</div>';
    }
    return '<div class="screen"><header class="top pad"><h1 class="title-xl" tabindex="-1">Host</h1><span class="status-tag">Approved mentor</span></header><div class="pad">' +
      '<div class="seg seg-2" role="group" aria-label="Show sessions" style="margin-bottom:14px">' + [['upcoming', 'Upcoming (' + list.length + ')'], ['past', 'Past']].map(function (t) {
        return '<button type="button" aria-pressed="' + (state.hostTab === t[0]) + '" data-act="hosttab" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' + body +
      '<div class="menu-list" style="margin-top:14px"><a class="menu-row" href="#earnings">' + ic('cal') + '<span>Earnings · ' + rp(projected()) + ' projected</span>' + ic('back').replace('<svg', '<svg class="chev" style="transform:rotate(180deg)"') + '</a></div>' +
      '<div style="height:20px"></div></div></div>' +
      '<div class="action pad"><a class="btn btn-primary" href="#new">' + ic('plus').replace('<svg', '<svg width="20" height="20"') + 'Create session</a></div>' + tabbar('host');
  }

  /* ---------- Mentor application ---------- */
  var appErr = {};
  function apply() {
    if (state.role !== 'none') { location.replace('#applied'); return ''; }
    var a = state.app, n = words(a.why);
    var courses = '<div class="chip-wrap" role="group" aria-label="Courses you can teach">' + Object.keys(D.courses).map(function (k) {
      return '<button type="button" class="chip" aria-pressed="' + (a.courses.indexOf(k) >= 0) + '" data-act="ap-course" data-v="' + k + '"><i style="background:var(--' + D.courses[k].colour + ')"></i>' + esc(D.courses[k].name) + '</button>';
    }).join('') + '</div>';
    var transcript = a.transcript
      ? '<div class="file-row">' + ic('check') + '<span><b>Transcript_Alex.pdf</b><small>Sample file for this demo</small></span><button class="link-btn" type="button" data-act="ap-transcript">Remove</button></div>'
      : '<button class="btn btn-secondary btn-block" id="ap-transcript" type="button" data-act="ap-transcript">Attach sample transcript</button>';
    return '<div class="screen">' + bar('Apply to teach', backBtn()) + '<form class="pad form-stack" id="apply-form" novalidate>' +
      '<p class="sub">We review every application before you can publish sessions.</p>' +
      field('ap-name', 'Full name', '<input id="ap-name" value="' + esc(D.user.full) + '" readonly aria-readonly="true">', null, 'From your LearNect account') +
      field('ap-campus', 'Campus', '<select id="ap-campus" data-ap="campus">' + D.campuses.map(function (c) { return '<option' + (c === a.campus ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>') +
      '<div class="field' + (appErr.courses ? ' has-err' : '') + '"><span class="flabel">Courses you can teach</span>' + courses + (appErr.courses ? '<p class="err">' + ic('warn') + '<span>' + appErr.courses + '</span></p>' : '') + '</div>' +
      field('ap-gpa', 'GPA', '<input id="ap-gpa" data-ap="gpa" inputmode="decimal" autocomplete="off" value="' + esc(a.gpa) + '"' + (appErr.gpa ? ' aria-invalid="true" aria-describedby="ap-gpa-err"' : '') + '>', appErr.gpa) +
      '<div class="field' + (appErr.transcript ? ' has-err' : '') + '"><span class="flabel">Transcript</span>' + transcript + (appErr.transcript ? '<p class="err">' + ic('warn') + '<span>' + appErr.transcript + '</span></p>' : '') + '</div>' +
      field('ap-why', 'How would you teach this course?', '<textarea id="ap-why" data-ap="why" rows="5"' + (appErr.why ? ' aria-invalid="true" aria-describedby="ap-why-err"' : '') + '>' + esc(a.why) + '</textarea>', appErr.why, '<span id="ap-count">' + n + '</span> of 20 words minimum') +
      '<div class="field"><span class="flabel">Preferred format</span><div class="seg" role="group" aria-label="Preferred format">' + [['online', 'Online'], ['onsite', 'On-site'], ['both', 'Both']].map(function (f) {
        return '<button type="button" aria-pressed="' + (a.format === f[0]) + '" data-act="ap-format" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field' + (appErr.confirm ? ' has-err' : '') + '"><label class="check-row"><input type="checkbox" id="ap-confirm" data-ap="confirm"' + (a.confirm ? ' checked' : '') + '><span>The information I gave is accurate and follows the academic code of conduct.</span></label>' + (appErr.confirm ? '<p class="err">' + ic('warn') + '<span>' + appErr.confirm + '</span></p>' : '') + '</div>' +
      '</form><div style="height:20px"></div></div><div class="action pad"><button class="btn btn-primary" type="button" data-act="ap-submit">Submit application</button></div>';
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
      render({ keepScroll: true });
      var first = app.querySelector('.has-err'); if (first) { first.scrollIntoView({ block: 'center' }); var f = first.querySelector('input, textarea, select, button'); if (f) f.focus({ preventScroll: true }); }
      return;
    }
    state.role = 'review'; save(); location.hash = '#applied';
  }
  function applied() {
    if (state.role === 'none') { location.replace('#apply'); return ''; }
    var a = state.app, ok = state.role === 'approved';
    return '<div class="screen">' + bar('Application', '<span></span>', '<a class="icon-btn plain" href="#host" aria-label="Close">' + ic('close') + '</a>') +
      '<div class="pad done-hero"><p class="title-xl">' + (ok ? 'You’re approved' : 'Application submitted') + '</p><p class="sub">' + (ok ? 'You can publish sessions from the Host tab.' : 'We’ll notify you when your status changes. You can keep booking sessions meanwhile.') + '</p></div>' +
      '<div class="pad"><div class="card">' +
      '<div class="row-line"><span class="k">Status</span><span><b>' + (ok ? 'Approved' : 'Under review') + '</b></span></div>' +
      '<div class="row-line"><span class="k">Applicant</span><span>' + esc(D.user.full) + '</span></div>' +
      '<div class="row-line"><span class="k">Campus</span><span style="text-align:right">' + esc(a.campus) + '</span></div>' +
      '<div class="row-line"><span class="k">Courses</span><span style="text-align:right">' + a.courses.map(function (c) { return esc(D.courses[c].name); }).join(', ') + '</span></div>' +
      '<div class="row-line"><span class="k">GPA</span><span>' + esc(a.gpa) + '</span></div></div>' +
      (ok ? '<a class="btn btn-primary btn-block" style="margin-top:18px" href="#host">Go to Host</a>'
        : '<div class="demo-box"><span class="demo-flag">Demo control</span><p>In the real app, the LearNect team reviews this. For the showcase, approve it here.</p><button class="btn btn-primary btn-block" type="button" data-act="ap-approve">Approve application</button></div>') +
      '<div style="height:24px"></div></div></div>';
  }

  /* ---------- Create session ---------- */
  function nwEnd() { return mins(state.nw.start) + state.nw.len; }
  function nwClash() {
    var a = mins(state.nw.start), b = nwEnd(), hit = null;
    classesOn(state.nw.day).forEach(function (c) { if (mins(c.start) < b && mins(c.end) > a) hit = c; });
    D.sessions.forEach(function (s) { if (s.day === state.nw.day && isBooked(s) && mins(s.start) < b && mins(s.end) > a) hit = { start: s.start, end: s.end, title: s.title, booked: true }; });
    return hit;
  }
  function nwFitHtml() {
    var c = nwClash(), n = state.nw;
    var slice = daySlice(n.day, { a: mins(n.start), b: nwEnd(), course: n.course, title: n.title });
    return slice + (c
      ? '<div class="fit clash" style="margin-top:10px">' + ic('warn') + '<span>Clashes with ' + (c.booked ? 'your booked session' : c.teaching ? 'your session' : 'your class') + ' <b>' + esc(c.title) + '</b> (' + c.start + '–' + c.end + ').</span></div>'
      : '<div class="fit" style="margin-top:10px">' + ic('gap') + '<span>' + DAY_L[n.day] + ' ' + n.start + '–' + hhmm(nwEnd()) + ' fits your free time.</span></div>');
  }
  var nwErr = '';
  function newSession() {
    if (state.role !== 'approved') { location.replace('#host'); return ''; }
    var n = state.nw, times = '';
    for (var t = 7 * 60; t <= 20 * 60; t += 30) times += '<option' + (hhmm(t) === n.start ? ' selected' : '') + '>' + hhmm(t) + '</option>';
    var days = '<div class="days days-flush" role="group" aria-label="Day">' + DAY_S.map(function (d, i) {
      var off = i <= D.TODAY_INDEX;
      return '<button type="button" class="day" aria-pressed="' + (i === n.day) + '" data-act="nw-day" data-v="' + i + '"' + (off ? ' disabled' : '') + ' aria-label="' + longDate(i) + '">' + d + '<b class="num">' + dayNum(i) + '</b></button>';
    }).join('') + '</div>';
    return '<div class="screen">' + bar('Create session', backBtn()) + '<form class="form-stack" id="new-form" novalidate><div class="pad form-stack">' +
      '<div class="field"><span class="flabel">Course</span><div class="chip-wrap" role="group" aria-label="Course">' + Object.keys(D.courses).map(function (k) {
        return '<button type="button" class="chip" aria-pressed="' + (n.course === k) + '" data-act="nw-course" data-v="' + k + '"><i style="background:var(--' + D.courses[k].colour + ')"></i>' + esc(D.courses[k].name) + '</button>';
      }).join('') + '</div></div>' +
      field('nw-title', 'Session title', '<input id="nw-title" data-nw="title" maxlength="40" autocomplete="off" value="' + esc(n.title) + '"' + (nwErr ? ' aria-invalid="true" aria-describedby="nw-title-err"' : '') + '>', nwErr) +
      '</div><div class="field"><span class="flabel pad">Day</span>' + days + '</div><div class="pad form-stack">' +
      '<div class="two-up">' + field('nw-start', 'Start', '<select id="nw-start" data-nw="start">' + times + '</select>') +
      '<div class="field"><span class="flabel">Length</span><div class="seg" role="group" aria-label="Length">' + [60, 90, 120].map(function (l) {
        return '<button type="button" aria-pressed="' + (n.len === l) + '" data-act="nw-len" data-v="' + l + '">' + l + 'm</button>';
      }).join('') + '</div></div></div>' +
      '<div id="nw-fit">' + nwFitHtml() + '</div>' +
      '<div class="field"><span class="flabel">Format</span><div class="seg seg-2" role="group" aria-label="Format">' + [['online', 'Online'], ['onsite', 'On-site']].map(function (f) {
        return '<button type="button" aria-pressed="' + (n.format === f[0]) + '" data-act="nw-format" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div></div>' +
      stepper('Seats', 'seats', n.seats, String(n.seats)) + stepper('Price per seat', 'price', n.price, rp(n.price)) +
      '<div class="card"><div class="row-line"><span class="k">If every seat sells</span><span>' + rp(n.seats * n.price) + '</span></div><div class="row-line total"><span>You keep 80%</span><span>' + rp(share(n.seats * n.price)) + '</span></div></div>' +
      '</div></form><div style="height:20px"></div></div>' +
      '<div class="action pad"><button class="btn btn-primary" type="button" data-act="nw-publish"' + (nwClash() ? ' disabled' : '') + '>' + (nwClash() ? 'Pick a free time' : 'Publish session') + '</button></div>';
  }
  function stepper(label, key, val, shown) {
    var lim = key === 'seats' ? [4, 10] : [15000, 50000];
    return '<div class="field"><span class="flabel">' + label + '</span><div class="stepper"><button type="button" id="st-' + key + '-m" aria-label="Fewer: ' + label + '" data-act="nw-step" data-k="' + key + '" data-d="-1"' + (val <= lim[0] ? ' disabled' : '') + '>' + ic('minus') + '</button><output class="num" aria-live="polite">' + shown + '</output><button type="button" id="st-' + key + '-p" aria-label="More: ' + label + '" data-act="nw-step" data-k="' + key + '" data-d="1"' + (val >= lim[1] ? ' disabled' : '') + '>' + ic('plus') + '</button></div></div>';
  }
  function publish() {
    var n = state.nw;
    if (!n.title.trim()) { nwErr = 'Give your session a title.'; render({ keepScroll: true }); var i = document.getElementById('nw-title'); if (i) i.focus(); return; }
    if (nwClash()) return;
    nwErr = '';
    state.hosted.push({ id: 'h-' + Date.now(), course: n.course, title: n.title.trim(), day: n.day, start: n.start, end: hhmm(nwEnd()), price: n.price, seats: n.seats, booked: 0,
      type: n.format, place: n.format === 'online' ? 'Google Meet' : 'Study Room, ' + state.app.campus.split(' (')[0] + ' Campus' });
    state.nw = JSON.parse(JSON.stringify(D.newSessionSeed)); state.nw.title = ''; state.hostTab = 'upcoming';
    // Open the next new session on a slot that is still free.
    for (var t = mins(state.nw.start); t <= 20 * 60 && nwClash(); t += 30) state.nw.start = hhmm(t);
    save();
    location.hash = '#host';
  }

  /* ---------- Manage a session, earnings ---------- */
  function manage(id) {
    var h = hosted(id); if (!h) return notFound();
    return '<div class="screen">' + bar('Manage session', backBtn()) + hostBand(h) + '<div class="pad">' +
      '<div class="seats-line" style="margin-top:4px">' + seatCells(h.booked, h.seats, true) + '<span>' + h.booked + ' of ' + h.seats + ' seats booked</span></div>' +
      '<div class="sec"><h2>Where</h2></div><div class="card place"><span class="ic">' + ic(h.type === 'online' ? 'video' : 'pin') + '</span><div><b>' + esc(h.place) + '</b><p>' + (h.type === 'online' ? 'The Meet link goes to your students 15 minutes before the start.' : 'Arrive 10 minutes early to open the room.') + '</p></div></div>' +
      '<div class="sec"><h2>Earnings</h2></div><div class="card"><div class="row-line"><span class="k">' + h.booked + ' × ' + rp(h.price) + '</span><span>' + rp(h.booked * h.price) + '</span></div>' +
      '<div class="row-line"><span class="k">LearNect’s 20%</span><span>' + rp(h.booked * h.price - share(h.booked * h.price)) + '</span></div>' +
      '<div class="row-line total"><span>You keep</span><span>' + rp(share(h.booked * h.price)) + '</span></div></div>' +
      '<button class="btn btn-secondary btn-block" style="margin-top:18px" type="button" data-act="host-cancel" data-id="' + h.id + '">Cancel session</button><div style="height:24px"></div></div></div>';
  }
  function hostCancelSheet(id) {
    var h = hosted(id), wrap = document.createElement('div');
    wrap.className = 'scrim';
    wrap.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="hc-title"><span class="grab" aria-hidden="true"></span><h2 id="hc-title">Cancel this session?</h2>' +
      '<p><b>' + esc(h.title) + '</b>, ' + longDate(h.day) + ' at ' + h.start + '.</p>' +
      '<div class="note">' + ic('info') + '<span>' + (h.booked ? 'All ' + h.booked + ' booked ' + (h.booked === 1 ? 'student gets' : 'students get') + ' a full refund.' : 'Nobody has booked yet.') + '</span></div>' +
      '<button class="btn btn-primary btn-block" type="button" data-act="host-cancel-yes" data-id="' + h.id + '">Cancel session</button><button class="btn btn-secondary btn-block" type="button" data-act="sheet-close">Keep session</button></div>';
    app.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('open'); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSheet(); });
    wrap.querySelector('[data-act="sheet-close"]').focus();
  }
  function earnings() {
    if (state.role !== 'approved') { location.replace('#host'); return ''; }
    var list = liveHosted();
    return '<div class="screen">' + bar('Earnings', backBtn()) + '<div class="pad">' +
      (list.length ? '<div class="list">' + list.map(hostBlock).join('') + '</div>' : '<div class="empty"><b>No sessions yet</b><p>Publish a session to see what it can earn.</p></div>') +
      '<div class="card" style="margin-top:12px"><div class="row-line total"><span>Projected, your 80%</span><span>' + rp(projected()) + '</span></div>' +
      '<div class="row-line"><span class="k">Available for payout</span><span>Rp0</span></div></div>' +
      '<p class="sub" style="font-size:13px;margin-top:8px">Money becomes available after each session is completed.</p>' +
      '<div style="height:24px"></div></div></div>';
  }

  /* ---------- Rating ---------- */
  function rate(id) {
    var p = D.past.filter(function (x) { return x.id === id; })[0]; if (!p) return notFound();
    var r = state.ratings[id] || { stars: 0, tags: [], note: '', sent: false };
    if (r.sent) return '<div class="screen">' + bar('Rate session', '<span></span>', '<a class="icon-btn plain" href="#sessions" aria-label="Close">' + ic('close') + '</a>') +
      '<div class="pad done-hero"><p class="title-xl">Thanks for rating</p><p class="sub">Your feedback helps ' + esc(D.mentors[p.mentor].name) + ' and the next student.</p></div><div class="pad"><a class="btn btn-primary btn-block" href="#sessions">Back to My Sessions</a></div></div>';
    var stars = '';
    for (var i = 1; i <= 5; i++) stars += '<button type="button" class="star' + (i <= r.stars ? ' on' : '') + '" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '" aria-pressed="' + (i === r.stars) + '" data-act="rate-star" data-id="' + id + '" data-v="' + i + '">' + ic('star') + '</button>';
    return '<div class="screen">' + bar('Rate session', backBtn()) + '<div class="band-wrap pad"><div class="band sun"><div class="time num">' + p.start + '<span>' + p.end + '</span></div><div><div class="t">' + esc(p.title) + '</div><div class="d">' + esc(p.date) + '</div><div class="d">' + esc(D.courses[p.course].name + ' · ' + D.mentors[p.mentor].name) + '</div></div></div></div><div class="pad form-stack">' +
      '<div class="field"><span class="flabel">How was this session?</span><div class="stars" role="group" aria-label="Rating">' + stars + '</div></div>' +
      '<div class="field"><span class="flabel">What went well?</span><div class="chip-wrap">' + D.ratingTags.map(function (t) {
        return '<button type="button" class="chip" aria-pressed="' + (r.tags.indexOf(t) >= 0) + '" data-act="rate-tag" data-id="' + id + '" data-v="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div></div>' +
      field('rate-note', 'Anything else? (optional)', '<textarea id="rate-note" data-rate="' + id + '" rows="3">' + esc(r.note) + '</textarea>') +
      '</div><div style="height:20px"></div></div><div class="action pad"><button class="btn btn-primary" type="button" data-act="rate-send" data-id="' + id + '"' + (r.stars ? '' : ' disabled') + '>' + (r.stars ? 'Send rating' : 'Pick a star rating') + '</button></div>';
  }

  /* ---------- Notifications, help, profile ---------- */
  function notifications() {
    var items = [];
    D.sessions.filter(isBooked).forEach(function (s) { items.push(['check', 'Booking confirmed', esc(s.title) + ', ' + shortDate(s.day) + ' at ' + s.start, '#sessions']); });
    if (state.role === 'review') items.push(['info', 'Application received', 'We’re reviewing your mentor application.', '#applied']);
    if (state.role === 'approved') items.push(['check', 'You’re an approved mentor', 'You can now publish sessions.', '#host']);
    if (!state.ratings.basics || !state.ratings.basics.sent) items.push(['star', 'Rate your last session', 'How was Python Basics Review with Alya?', '#rate/basics']);
    items.push(['gap', 'Sessions fit your Saturday', 'See what’s in your free gap after 11:00.', '#home', ' data-act="see-week" data-day="5"']);
    return '<div class="screen">' + bar('Notifications', backBtn()) + '<div class="pad"><div class="notif-list">' + items.map(function (n) {
      return '<a class="notif" href="' + n[3] + '"' + (n[4] || '') + '><span class="ic">' + ic(n[0]) + '</span><span><b>' + n[1] + '</b><small>' + n[2] + '</small></span></a>';
    }).join('') + '</div>' +
      '<div class="sec"><h2>Send me</h2></div><div class="card">' + [['remind', 'Session reminders'], ['fits', 'New sessions that fit my week']].map(function (p) {
        return '<label class="switch-row"><span>' + p[1] + '</span><input type="checkbox" role="switch" data-pref="' + p[0] + '"' + (state.prefs[p[0]] ? ' checked' : '') + '><i aria-hidden="true"></i></label>';
      }).join('') + '</div><div style="height:24px"></div></div></div>';
  }
  function help() {
    return '<div class="screen">' + bar('Help & support', backBtn()) + '<div class="pad"><div class="faq-list">' + D.help.map(function (h) {
      return '<div><h2>' + esc(h.q) + '</h2><p>' + esc(h.a) + '</p></div>';
    }).join('') + '</div><div style="height:24px"></div></div></div>';
  }
  function profile() {
    var teach = state.role === 'approved'
      ? '<div class="card mentor-card"><div class="mc-head"><b>' + (liveHosted().length === 0 ? 'No upcoming sessions' : liveHosted().length === 1 ? '1 upcoming session' : liveHosted().length + ' upcoming sessions') + '</b><span class="status-tag">Approved mentor</span></div><p class="sub">' + rp(projected()) + ' projected</p><a class="btn btn-primary btn-block" href="#host">Manage teaching</a></div>'
      : state.role === 'review'
        ? '<div class="card mentor-card"><div class="mc-head"><b>Mentor application</b><span class="status-tag">Under review</span></div><p class="sub">We’ll notify you when your status changes.</p><a class="btn btn-secondary btn-block" href="#applied">See application</a></div>'
        : '<div class="card mentor-card"><b>Want to teach?</b><p class="sub">Help other students with a course you aced and keep 80% of each booking.</p><a class="btn btn-primary btn-block" href="#host">Become a mentor</a></div>';
    var row = function (href, icon, label) { return '<a class="menu-row" href="' + href + '">' + ic(icon) + '<span>' + label + '</span>' + ic('back').replace('<svg', '<svg class="chev" style="transform:rotate(180deg)"') + '</a>'; };
    return '<div class="screen"><header class="top pad"><h1 class="title-xl" tabindex="-1">Profile</h1></header><div class="pad">' +
      '<div class="card mentor"><span class="avatar" aria-hidden="true">A</span><div><b>' + esc(D.user.full) + '</b><div class="meta">' + esc(D.user.major) + ' · ' + esc(D.user.campus) + '</div></div></div>' +
      '<div class="sec"><h2>My courses</h2></div><div class="chip-wrap">' + Object.keys(D.courses).map(function (k) {
        return '<span class="chip chip-static"><i style="background:var(--' + D.courses[k].colour + ')"></i>' + esc(D.courses[k].name) + '</span>';
      }).join('') + '</div>' +
      '<div class="sec"><h2>Teaching</h2></div>' + teach +
      '<div class="sec"><h2>Account</h2></div><div class="menu-list">' + row('#notifications', 'bell', 'Notifications') + row('#help', 'info', 'Help & support') + '</div>' +
      '<button class="btn btn-secondary btn-block" style="margin-top:16px" type="button" data-act="reset">Reset demo</button><div style="height:24px"></div></div></div>' + tabbar('profile');
  }

  /* ---------- Host, form and rating actions ---------- */
  function hostAct(act, t) {
    var v = t.getAttribute('data-v'), a = state.app, n = state.nw, again = function () { save(); var id = t.id; render({ keepScroll: true }); if (id) { var el = document.getElementById(id); if (el && !el.disabled) el.focus(); } };
    switch (act) {
      case 'hosttab': state.hostTab = v; again(); return true;
      case 'ap-course': var i = a.courses.indexOf(v); if (i >= 0) a.courses.splice(i, 1); else a.courses.push(v); delete appErr.courses; again(); return true;
      case 'ap-format': a.format = v; again(); return true;
      case 'ap-transcript': a.transcript = !a.transcript; delete appErr.transcript; again(); return true;
      case 'ap-submit': submitApply(); return true;
      case 'ap-approve':
        state.role = 'approved';
        if (!state.hosted.length) state.hosted = JSON.parse(JSON.stringify(D.hostSeed));
        save(); location.hash = '#host'; return true;
      case 'nw-course': n.course = v; again(); return true;
      case 'nw-day': n.day = +v; again(); return true;
      case 'nw-len': n.len = +v; again(); return true;
      case 'nw-format': n.format = v; again(); return true;
      case 'nw-step':
        var k = t.getAttribute('data-k'), d = +t.getAttribute('data-d');
        if (k === 'seats') n.seats = Math.max(4, Math.min(10, n.seats + d)); else n.price = Math.max(15000, Math.min(50000, n.price + d * 5000));
        again(); return true;
      case 'nw-publish': publish(); return true;
      case 'host-cancel': hostCancelSheet(t.getAttribute('data-id')); return true;
      case 'host-cancel-yes':
        state.hosted = state.hosted.filter(function (h) { return h.id !== t.getAttribute('data-id'); }); save(); closeSheet();
        setTimeout(function () { location.hash = '#host'; }, 200); return true;
      case 'rate-star': case 'rate-tag': case 'rate-send':
        var id = t.getAttribute('data-id'), r = state.ratings[id] || (state.ratings[id] = { stars: 0, tags: [], note: '', sent: false });
        if (act === 'rate-star') r.stars = +v;
        if (act === 'rate-tag') { var x = r.tags.indexOf(v); if (x >= 0) r.tags.splice(x, 1); else r.tags.push(v); }
        if (act === 'rate-send') r.sent = true;
        again(); return true;
    }
    return false;
  }
  function hostInput(e) {
    var el = e.target, k;
    if ((k = el.getAttribute('data-ap'))) {
      state.app[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'why') { var c = document.getElementById('ap-count'); if (c) c.textContent = words(el.value); }
      if (appErr[k]) { delete appErr[k]; var w = el.closest('.field'); if (w) { w.classList.remove('has-err'); var er = w.querySelector('.err'); if (er) er.remove(); } el.removeAttribute('aria-invalid'); }
      save(); return true;
    }
    if ((k = el.getAttribute('data-nw'))) {
      state.nw[k] = el.value; save();
      if (k === 'title') { var fitBox = document.getElementById('nw-fit'); if (fitBox) fitBox.innerHTML = nwFitHtml(); }
      if (k === 'title' && nwErr) { nwErr = ''; var fw = el.closest('.field'); if (fw) { fw.classList.remove('has-err'); var fe = fw.querySelector('.err'); if (fe) fe.remove(); } el.removeAttribute('aria-invalid'); }
      if (k === 'start') { var id = el.id; render({ keepScroll: true }); var s = document.getElementById(id); if (s) s.focus(); }
      return true;
    }
    if ((k = el.getAttribute('data-rate'))) { var r = state.ratings[k] || (state.ratings[k] = { stars: 0, tags: [], note: '', sent: false }); r.note = el.value; save(); return true; }
    if ((k = el.getAttribute('data-pref'))) { state.prefs[k] = el.checked; save(); return true; }
    return false;
  }
  function notFound() {
    return '<div class="screen">' + bar('Not found', backBtn()) + '<div class="pad"><div class="empty"><b>That session doesn’t exist</b><p>It may have been removed.</p><a class="btn btn-primary" href="#home">Go home</a></div></div></div>';
  }

  /* ---------- Router ---------- */
  var DEPTH = { home: 0, explore: 0, sessions: 0, host: 0, profile: 0, s: 1, pay: 2, qris: 3, done: 4, apply: 1, applied: 2, new: 1, manage: 1, earnings: 1, rate: 1, notifications: 1, help: 1 };
  function parse() {
    var h = (location.hash || '#home').slice(1).split('/');
    var name = DEPTH.hasOwnProperty(h[0]) ? h[0] : 'home';
    return { name: name, id: h[1] };
  }
  var current = parse();

  function view(r) {
    switch (r.name) {
      case 'explore': return explore();
      case 's': return details(r.id);
      case 'pay': return pay(r.id);
      case 'qris': return qris(r.id);
      case 'done': return done(r.id);
      case 'sessions': return sessions();
      case 'host': return host();
      case 'profile': return profile();
      case 'apply': return apply();
      case 'applied': return applied();
      case 'new': return newSession();
      case 'manage': return manage(r.id);
      case 'earnings': return earnings();
      case 'rate': return rate(r.id);
      case 'notifications': return notifications();
      case 'help': return help();
      default: return home();
    }
  }
  function render(opts) {
    clearInterval(timerId);
    var html = view(current);
    if (html === '') return; // a redirect is under way
    var keepScroll = opts && opts.keepScroll ? (app.querySelector('.screen') || {}).scrollTop : 0;
    app.innerHTML = html;
    var sc = app.querySelector('.screen'); if (sc) sc.scrollTop = keepScroll || 0;
    if (current.name === 'qris') startTimer();
    var strip = app.querySelector('.days'), sel = strip && strip.querySelector('[aria-pressed="true"]');
    if (strip && sel) {
      // Keep the chosen day in view with the next one peeking in at the edge.
      var want = sel.offsetLeft + sel.offsetWidth * 1.5 + 6 - strip.clientWidth;
      strip.scrollLeft = Math.max(0, Math.min(want, strip.scrollWidth - strip.clientWidth));
    }
    if (!(opts && opts.keepScroll)) { var h1 = app.querySelector('h1'); if (h1) h1.focus({ preventScroll: true }); }
    var titles = { home: 'Your week', explore: 'Explore', s: 'Session', pay: 'Review & pay', qris: 'Pay with QRIS', done: 'Booking confirmed', sessions: 'My Sessions', host: 'Host', profile: 'Profile', apply: 'Apply to teach', applied: 'Application', new: 'Create session', manage: 'Manage session', earnings: 'Earnings', rate: 'Rate session', notifications: 'Notifications', help: 'Help & support' };
    document.title = 'LearNect · ' + (titles[current.name] || 'Demo');
  }
  function go() {
    var next = parse();
    var a = DEPTH[current.name], b = DEPTH[next.name];
    var nav = a === 0 && b === 0 ? 'tab' : (b > a ? 'push' : 'pop');
    current = next;
    document.documentElement.dataset.nav = nav;
    // Animate only when the page is on screen; a hidden tab or an interrupted transition must never hold up the screen change.
    if (document.startViewTransition && !reduceMotion && document.visibilityState === 'visible') {
      var drawn = false, draw = function () { if (!drawn) { drawn = true; render(); } };
      var vt = document.startViewTransition(draw);
      [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (p) { if (p && p.catch) p.catch(function () {}); });
      setTimeout(function () { if (!drawn) { draw(); try { vt.skipTransition(); } catch (e) {} } }, 140);
    } else render();
  }
  window.addEventListener('hashchange', go);

  /* ---------- Events ---------- */
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'noop') { e.preventDefault(); return; }
    if (act === 'back') { e.preventDefault(); if (history.length > 1) history.back(); else location.hash = '#home'; return; }
    if (act === 'day') { state.day = +t.getAttribute('data-day'); save(); render({ keepScroll: true }); return; }
    if (act === 'see-week') { state.day = +t.getAttribute('data-day'); save(); return; } // the link continues to #home
    if (act === 'course') { state.course = t.getAttribute('data-v'); save(); render({ keepScroll: true }); return; }
    if (act === 'format') { state.format = t.getAttribute('data-v'); save(); render({ keepScroll: true }); return; }
    if (act === 'clear') { state.course = 'all'; state.format = 'all'; state.q = ''; save(); render({ keepScroll: true }); return; }
    if (act === 'mytab') { state.mytab = t.getAttribute('data-v'); save(); render({ keepScroll: true }); return; }
    if (act === 'cancel') { cancelSheet(t.getAttribute('data-id')); return; }
    if (act === 'sheet-close') { closeSheet(); return; }
    if (act === 'cancel-yes') {
      var cid = t.getAttribute('data-id');
      delete state.booked[cid]; state.cancelled[cid] = true; save();
      closeSheet(); setTimeout(function () { render({ keepScroll: true }); }, 200); return;
    }
    if (act === 'reset') { resetDemo(); return; }
    if (hostAct(act, t)) return;
    if (act === 'paid') {
      var id = t.getAttribute('data-id');
      t.disabled = true; t.innerHTML = '<span class="spin" aria-hidden="true"></span>Checking payment…';
      setTimeout(function () {
        state.booked[id] = true; delete state.cancelled[id]; state.lastBooked = id; state.day = S(id).day; save();
        location.hash = '#done/' + id;
      }, 900);
    }
  });
  app.addEventListener('input', function (e) {
    if (hostInput(e)) return;
    if (e.target.id === 'q') {
      state.q = e.target.value; save();
      var r = document.getElementById('results'); if (r) r.innerHTML = exploreResults();
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function resetDemo() {
    state = fresh(); save();
    if (location.hash === '#home' || !location.hash) render(); else location.hash = '#home';
  }
  var rb = document.getElementById('reset-demo'); if (rb) rb.addEventListener('click', resetDemo);

  // Scale the desktop handset to the window, but keep its text readable on a short laptop screen.
  function fitHandset() {
    var fit = Math.min(1, (window.innerHeight - 48) / 976, (window.innerWidth - 48) / 466);
    document.documentElement.style.setProperty('--fit', Math.max(0.72, fit).toFixed(4));
  }
  fitHandset();
  window.addEventListener('resize', fitHandset);

  render();
})();
