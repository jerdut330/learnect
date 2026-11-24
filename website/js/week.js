/* The live week on the LearNect website. It reads the shared sample data file (demo/js/data.js),
   so every page shows the same sessions, prices and seats. */
(function () {
  'use strict';
  var D = window.LN_DATA;
  // Real dates: fill in this week's dates wherever the page names one.
  (function () {
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var wk = document.querySelectorAll('[data-ln-week]'), dd = document.querySelectorAll('[data-ln-day]'), i;
    for (i = 0; i < wk.length; i++) wk[i].textContent = 'Demo · ' + D.WEEK_LABEL;
    for (i = 0; i < dd.length; i++) { var n = +dd[i].getAttribute('data-ln-day'), x = new Date(D.WEEK_START + 'T00:00:00'); x.setDate(x.getDate() + n); dd[i].textContent = DAYS[n] + ' ' + x.getDate() + ' ' + MON[x.getMonth()]; }
  })();
  var root = document.querySelector('[data-week]');
  var DAY_S = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_L = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var START = 7 * 60, END = 21 * 60;
  var SHORT = { regression: 'Regression', derivatives: 'Derivatives', python: 'Python Loops', limits: 'Limits', trees: 'Decision Trees', sql: 'SQL Joins', recursion: 'Recursion', integrals: 'Integrals', neural: 'Neural Nets' };

  function mins(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function pct(m) { return ((m - START) / (END - START)) * 100; }
  function rp(n) { return 'Rp' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dateNum(d) { var x = new Date(D.WEEK_START + 'T00:00:00'); x.setDate(x.getDate() + d); return x.getDate(); }
  function classesOn(d) { return D.classes.filter(function (c) { return c.day === d; }); }
  function clash(s) { var a = mins(s.start), b = mins(s.end), hit = null; classesOn(s.day).forEach(function (c) { if (mins(c.start) < b && mins(c.end) > a) hit = c; }); return hit; }
  function mine(s) { return s.id === 'regression'; } // Alex's one booking in this demo week
  function taken(s) { return s.booked + (mine(s) ? 1 : 0); }
  function left(s) { return s.seats - taken(s); }
  function tone(s) { return mine(s) ? 'sun' : left(s) <= 0 ? 'is-full' : D.courses[s.course].colour; }
  function byId(id) { return D.sessions.filter(function (s) { return s.id === id; })[0]; }
  function gaps(d) {
    var cur = START, out = [];
    classesOn(d).map(function (c) { return [mins(c.start), mins(c.end)]; }).sort(function (a, b) { return a[0] - b[0]; }).forEach(function (c) { if (c[0] > cur) out.push([cur, c[0]]); cur = Math.max(cur, c[1]); });
    if (cur < END) out.push([cur, END]);
    return out;
  }

  var sorted = D.sessions.slice().sort(function (a, b) { return a.day - b.day || mins(a.start) - mins(b.start); });
  var selected = 'regression', viewDay = 5;

  function gridHtml() {
    var h = '<div class="wk__corner"></div>';
    DAY_S.forEach(function (n, i) { h += '<div class="wk__dh' + (i === D.TODAY_INDEX ? ' is-today' : '') + '">' + n + ' <b>' + dateNum(i) + '</b></div>'; });
    h += '<div class="wk__hours">';
    for (var t = START + 60; t < END; t += 120) h += '<span style="top:' + pct(t) + '%">' + hhmm(t) + '</span>';
    h += '</div>';
    DAY_S.forEach(function (n, d) {
      h += '<div class="wk__col" role="group" aria-label="' + DAY_L[d] + '">';
      var day = sorted.filter(function (s) { return s.day === d && !clash(s); });
      gaps(d).forEach(function (g) {
        if (day.some(function (s) { return mins(s.start) >= g[0] && mins(s.end) <= g[1]; })) {
          h += '<div class="wk__g" style="top:' + pct(g[0]) + '%;height:' + (pct(g[1]) - pct(g[0])) + '%"></div>';
        }
      });
      classesOn(d).forEach(function (c) {
        h += '<div class="wk__c" style="top:' + pct(mins(c.start)) + '%;height:' + (pct(mins(c.end)) - pct(mins(c.start))) + '%">' + esc(c.title.split(' ')[0]) + '</div>';
      });
      day.forEach(function (s) {
        h += '<button type="button" class="wk__s ' + tone(s) + '" data-pick="' + s.id + '" aria-pressed="' + (s.id === selected) + '" aria-label="' + esc(s.title + ', ' + DAY_L[d] + ' at ' + s.start) + '" style="top:' + pct(mins(s.start)) + '%;height:' + (pct(mins(s.end)) - pct(mins(s.start))) + '%"><b>' + s.start + '</b>' + esc(SHORT[s.id]) + '</button>';
      });
      h += '</div>';
    });
    return h;
  }

  /* Under 1280px: the same timetable, one day at a time */
  function dayHtml() {
    var strip = '<div class="wd__strip" role="group" aria-label="Choose a day">' + DAY_S.map(function (n, i) {
      return '<button type="button" class="wd__d' + (i === D.TODAY_INDEX ? ' is-today' : '') + '" data-day="' + i + '" aria-pressed="' + (i === viewDay) + '" aria-label="' + DAY_L[i] + ' ' + dateNum(i) + ' November">' + n + '<b>' + dateNum(i) + '</b></button>';
    }).join('') + '</div>';
    var cls = classesOn(viewDay), day = sorted.filter(function (s) { return s.day === viewDay && !clash(s); });
    var st = cls.map(function (c) { return mins(c.start); }).concat(day.map(function (s) { return mins(s.start); }));
    var en = cls.map(function (c) { return mins(c.end); }).concat(day.map(function (s) { return mins(s.end); }));
    var w0 = st.length ? Math.floor(Math.min.apply(null, st) / 60) * 60 : 9 * 60, w1 = en.length ? Math.ceil(Math.max.apply(null, en) / 60) * 60 : 17 * 60;
    if (w1 - w0 < 360) w1 = w0 + 360;
    function p(m) { return ((m - w0) / (w1 - w0)) * 100; }
    var step = w1 - w0 > 480 ? 120 : 60, h = '';
    for (var t = w0; t < w1; t += step) h += '<span class="wd__hr" style="top:' + p(t) + '%">' + hhmm(t) + '</span>';
    gaps(viewDay).forEach(function (g) {
      if (!day.some(function (s) { return mins(s.start) >= g[0] && mins(s.end) <= g[1]; })) return;
      var a = Math.max(g[0], w0), b = Math.min(g[1], w1);
      h += '<div class="wd__gap" style="top:' + p(a) + '%;height:' + (p(b) - p(a)) + '%"></div>';
    });
    cls.forEach(function (c) {
      h += '<div class="wd__class" style="top:' + p(mins(c.start)) + '%;height:' + (p(mins(c.end)) - p(mins(c.start))) + '%"><b>' + esc(c.title.split(' ')[0]) + '</b><span>Your class</span></div>';
    });
    day.forEach(function (s) {
      h += '<button type="button" class="wd__s ' + tone(s) + '" data-pick="' + s.id + '" aria-pressed="' + (s.id === selected) + '" aria-label="' + esc(s.title + ', ' + DAY_L[s.day] + ' at ' + s.start) + '" style="top:' + p(mins(s.start)) + '%;height:' + (p(mins(s.end)) - p(mins(s.start))) + '%"><b>' + s.start + '</b><span>' + esc(SHORT[s.id]) + '</span><em>' + (mine(s) ? 'Booked' : rp(s.price)) + '</em></button>';
    });
    if (!day.length) h += '<p class="wd__none">No sessions fit this day. Try Saturday.</p>';
    return strip + '<div class="wd__tt" style="--rows:' + (w1 - w0) / 30 + '">' + h + '</div>';
  }

  function paneHtml() {
    var s = byId(selected), m = D.mentors[s.mentor], c = clash(s), l = left(s), cells = '';
    for (var i = 0; i < s.seats; i++) cells += '<i' + (i < taken(s) ? ' class="f"' : '') + '></i>';
    var before = classesOn(s.day).filter(function (x) { return mins(x.end) <= mins(s.start); }).pop();
    var fit = c ? 'Clashes with your ' + c.start + ' class'
      : before ? 'Fits your free time, after your class ends at ' + before.end
      : classesOn(s.day).length ? 'Fits your free time before your first class' : 'Fits your free time. No classes that day';
    return '<div class="pn__band ' + tone(s) + '"><span class="ln-time">' + s.start + '<small>' + s.end + '</small></span><strong>' + esc(s.title) + '</strong></div>' +
      '<p class="pn__meta">' + DAY_L[s.day] + ' ' + dateNum(s.day) + ' Nov · ' + esc(D.courses[s.course].name) + ' · ' + esc(s.format.type === 'online' ? 'Online' : s.format.place) + '</p>' +
      '<div class="pn__who"><span class="pn__av" aria-hidden="true">' + m.initial + '</span><div><b>' + esc(m.full) + '</b><span>Peer mentor · ' + esc(m.major) + '</span></div></div>' +
      '<div class="pn__fit' + (c ? ' is-clash' : '') + '">' + fit + '</div>' +
      '<div class="pn__seats"><span class="cells" aria-hidden="true">' + cells + '</span><span>' + (mine(s) ? 'Booked · ' : '') + (l <= 0 ? 'Full' : l + ' of ' + s.seats + ' seats left') + '</span></div>' +
      '<div class="pn__learn"><b>What you’ll learn</b>' + s.learn.map(function (x) { return '<span><i></i>' + esc(x) + '</span>'; }).join('') + '</div>' +
      '<div class="pn__foot"><span class="pn__price">' + rp(s.price) + '</span><a class="link pn__open" href="app/#s/' + s.id + '">Open this session</a></div>';
  }

  function render(focusId) {
    root.querySelector('[data-week-grid]').innerHTML = gridHtml();
    root.querySelector('[data-week-day]').innerHTML = dayHtml();
    root.querySelector('[data-week-pane]').innerHTML = paneHtml();
    if (focusId) {
      var all = root.querySelectorAll('[data-pick="' + focusId + '"]');
      for (var i = 0; i < all.length; i++) if (all[i].offsetParent !== null) { all[i].focus({ preventScroll: true }); break; }
    }
  }

  if (root && D) {
    root.addEventListener('click', function (e) {
      var d = e.target.closest('[data-day]');
      if (d) {
        viewDay = +d.getAttribute('data-day');
        var first = sorted.filter(function (s) { return s.day === viewDay && !clash(s); })[0];
        if (first) selected = first.id;
        render();
        var again = root.querySelector('[data-day="' + viewDay + '"]'); if (again) again.focus({ preventScroll: true });
        return;
      }
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      selected = b.getAttribute('data-pick');
      viewDay = byId(selected).day;
      render(selected);
    });
    render();
  }

  /* The drawn QR in step 2: a pattern only, it does not encode a payment. */
  var q = document.querySelector('[data-qr]');
  if (q) {
    var n = 21, cell = 6, seed = 2166136261, out = '<svg viewBox="0 0 ' + n * cell + ' ' + n * cell + '" aria-hidden="true">';
    function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1000) / 1000; }
    function f(x, y) { return '<rect x="' + x * cell + '" y="' + y * cell + '" width="' + 7 * cell + '" height="' + 7 * cell + '" fill="#1B2340"/><rect x="' + (x + 1) * cell + '" y="' + (y + 1) * cell + '" width="' + 5 * cell + '" height="' + 5 * cell + '" fill="#fff"/><rect x="' + (x + 2) * cell + '" y="' + (y + 2) * cell + '" width="' + 3 * cell + '" height="' + 3 * cell + '" fill="#1B2340"/>'; }
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if ((x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)) continue;
      if (rnd() > .52) out += '<rect x="' + x * cell + '" y="' + y * cell + '" width="' + cell + '" height="' + cell + '" fill="#1B2340"/>';
    }
    q.innerHTML = out + f(0, 0) + f(n - 7, 0) + f(0, n - 7) + '</svg>';
  }
})();
