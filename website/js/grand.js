/* The front page's opening: Alex's real week as a paper model. Each session is a tower and each floor is a seat.
   Scrolling flies through the week, books one seat, then lays the model flat onto the live timetable. */
(function () {
  'use strict';
  var D = window.LN_DATA, root = document.querySelector('[data-grand]');
  if (!root || !D) { document.documentElement.classList.remove('grand-live'); return; }
  var stage = root.querySelector('.grand__stage'), canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  var live = root.querySelector('[data-grand-live]'), weekBox = document.querySelector('[data-week]'), weekSection = document.getElementById('week');
  var weekHome = weekBox ? weekBox.parentNode : null, moved = false;
  var beats = [].slice.call(root.querySelectorAll('[data-from]'));
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COL = { paper: '#FBFBF7', navy: '#1B2340', rule: '#E3E6EE', ghost: '#9AA1B5', muted: '#545C76', cobalt: '#3A5BD9', tomato: '#F4694D', teal: '#1FA38A', sun: '#FFC531', white: '#FFFFFF' };
  var CW = 120, CH = 52, FLOOR = 11, CAP = 2.5, START = 420, W = CW * 7, H = CH * 14;
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var SHORT = { regression: 'Regression', derivatives: 'Derivatives', python: 'Python Loops', limits: 'Limits', trees: 'Decision Trees', sql: 'SQL Joins', recursion: 'Recursion', integrals: 'Integrals', neural: 'Neural Nets' };
  var TIME = '800 expanded $px Archivo, sans-serif', BOLD = '700 $px "Hanken Grotesk", sans-serif', SEMI = '600 $px "Hanken Grotesk", sans-serif', MEDIUM = '500 $px "Hanken Grotesk", sans-serif';

  function mins(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function yAt(m) { return (m - START) / 60 * CH; }
  function clamp(n) { return Math.max(0, Math.min(1, n)); }
  function seg(p, a, b) { return clamp((p - a) / (b - a)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function out(t) { return 1 - Math.pow(1 - t, 4); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dateNum(d) { var x = new Date(D.WEEK_START + 'T00:00:00'); x.setDate(x.getDate() + d); return x.getDate(); }
  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16), a = [n >> 16, n >> 8 & 255, n & 255], b = [27, 35, 64];
    return 'rgb(' + a.map(function (v, i) { return Math.round(lerp(v, b[i], amount)); }).join(',') + ')';
  }

  /* The model, built from the shared sample data */
  var columns = DAYS.map(function () { return []; }), gaps = [];
  D.classes.forEach(function (c) {
    columns[c.day].push({ kind: 'class', day: c.day, x1: c.day * CW + 3, x2: (c.day + 1) * CW - 3, y1: yAt(mins(c.start)), y2: yAt(mins(c.end)), code: c.title.split(' ')[0], room: c.room });
  });
  D.sessions.forEach(function (s) {
    var a = mins(s.start), b = mins(s.end);
    if (D.classes.some(function (c) { return c.day === s.day && mins(c.start) < b && mins(c.end) > a; })) return;
    columns[s.day].push({ kind: 'session', id: s.id, day: s.day, x1: s.day * CW + 3, x2: (s.day + 1) * CW - 3, y1: yAt(a), y2: yAt(b), start: s.start, label: SHORT[s.id] || s.title, colour: COL[D.courses[s.course].colour], light: D.courses[s.course].colour === 'cobalt', seats: s.seats, taken: s.booked });
  });
  columns.forEach(function (list, day) {
    list.sort(function (a, b) { return a.y1 - b.y1; });
    list.forEach(function (b) { b.delay = 0.1 + day * 0.055 + b.y1 / H * 0.32; });
    var cur = 0, spans = [];
    list.filter(function (b) { return b.kind === 'class'; }).forEach(function (b) { if (b.y1 > cur + 2) spans.push([cur, b.y1]); cur = b.y2; });
    if (cur < H) spans.push([cur, H]);
    spans.forEach(function (g) {
      if (list.some(function (b) { return b.kind === 'session' && b.y1 >= g[0] && b.y2 <= g[1]; })) gaps.push({ x1: day * CW + 2, x2: (day + 1) * CW - 2, y1: g[0], y2: g[1] });
    });
  });
  var hero = columns[5].filter(function (b) { return b.id === 'regression'; })[0];

  /* On a wide screen the live timetable waits at the end of the flight */
  function placeWeek() {
    if (!live || !weekBox || !weekSection || still) return;
    var wide = window.matchMedia('(min-width: 1280px)').matches;
    if (wide && !moved) { live.appendChild(weekBox); weekSection.classList.add('grand-moved'); root.classList.add('has-live'); moved = true; }
    else if (!wide && moved) { weekHome.appendChild(weekBox); weekSection.classList.remove('grand-moved'); root.classList.remove('has-live'); live.classList.remove('is-on'); moved = false; }
  }

  function hull(points) {
    var pts = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), lo = [], up = [], i;
    function turn(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    for (i = 0; i < pts.length; i++) { while (lo.length > 1 && turn(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length > 1 && turn(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  function topAt(poly, l, r) {
    var best = Infinity;
    for (var x = l; x <= r; x += 8) {
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[0] <= x && b[0] >= x) || (b[0] <= x && a[0] >= x)) best = Math.min(best, a[0] === b[0] ? Math.min(a[1], b[1]) : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
      }
    }
    return best;
  }
  function sessionsList() { return columns.reduce(function (all, list) { return all.concat(list.filter(function (b) { return b.kind === 'session'; })); }, []); }
  function labelZone(b, z, rel) { return [rel(b.x1 + 8, b.y1 + 6, z), rel(b.x1 + 104, b.y1 + 6, z), rel(b.x1 + 8, b.y1 + 46, z), rel(b.x1 + 104, b.y1 + 46, z)]; }
  /* Finds the largest opening view that keeps every session label readable and every word clear of the model */
  function frameOpening(fallback) {
    var c = Math.cos(YAW0), n = Math.sin(YAW0), kt = Math.cos(TILT0), kz = Math.sin(TILT0), floor = FLOOR * OPEN_LIFT;
    function rel(x, y, z) { return [(x - FX) * c - (y - FY) * n, ((x - FX) * n + (y - FY) * c) * kt - z * kz]; }
    var top0 = stage.getBoundingClientRect().top, title = root.querySelector('.grand__title'), lead = root.querySelector('.grand__lead'), actions = root.querySelector('.grand__actions');
    var range = document.createRange(); range.selectNodeContents(title);
    var hr = range.getBoundingClientRect(), lr = lead.getBoundingClientRect(), ar = actions.getBoundingClientRect(), last = actions.lastElementChild.getBoundingClientRect();
    var words = [{ l: hr.left, r: hr.right, b: hr.bottom - top0 }, { l: Math.min(lr.left, ar.left), r: slim ? vw : Math.max(lr.right, last.right), b: Math.max(lr.bottom, ar.bottom) - top0 }];
    var nav = (document.querySelector('.nav').offsetHeight || 64) + 10, zones = [], shapes = [[rel(360 - railW, -headW, 0), rel(W + 260, -headW, 0), rel(W + 260, H + 260, 0), rel(360 - railW, H + 260, 0)]];
    sessionsList().forEach(function (b) {
      var z = b.seats * floor + CAP, corners = [];
      zones = zones.concat(labelZone(b, z, rel));
      [b.x1, b.x2].forEach(function (x) { [b.y1, b.y2].forEach(function (y) { [0, z].forEach(function (h) { corners.push(rel(x, y, h)); }); }); });
      shapes.push(hull(corners));
    });
    var xs = zones.map(function (p) { return p[0]; }), ys = zones.map(function (p) { return p[1]; }), maxX = Math.max.apply(null, xs), minX = Math.min.apply(null, xs), maxY = Math.max.apply(null, ys);
    var shapeTop = Math.min.apply(null, shapes.map(function (shape) { return Math.min.apply(null, shape.map(function (p) { return p[1]; })); }));
    for (var s = Math.min(2.6, Math.min(vw, vh * 1.6) / 520); s >= 0.45; s -= 0.015) {
      var ox = vw - (slim ? 8 : 12) - s * maxX;
      if (ox + s * minX < 8) continue;
      var low = nav - s * shapeTop;
      shapes.forEach(function (shape) {
        var placed = shape.map(function (p) { return [ox + s * p[0], s * p[1]]; });
        words.forEach(function (w) { var t = topAt(placed, w.l - 12, w.r + 12); if (t !== Infinity) low = Math.max(low, w.b + 16 - t); });
      });
      var high = vh - 8 - s * maxY;
      if (low <= high) return { s: s, ox: ox / vw, oy: (low + (high - low) * 0.4) / vh };
    }
    return fallback;
  }
  function frameLabels(yaw, tilt, floor, top, bottom, most) {
    var c = Math.cos(yaw), n = Math.sin(yaw), kt = Math.cos(tilt), kz = Math.sin(tilt), pts = [];
    function rel(x, y, z) { return [x * c - y * n, (x * n + y * c) * kt - z * kz]; }
    sessionsList().forEach(function (b) { pts = pts.concat(labelZone(b, b.seats * floor + CAP, rel)); });
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var s = Math.min((vw - 24) / (x1 - x0), (bottom - top) / (y1 - y0), most);
    return { s: s, ox: (vw - s * (x0 + x1)) / 2 / vw, oy: ((top + bottom) / 2 - s * (y0 + y1) / 2) / vh };
  }

  /* Camera */
  var vw = 0, vh = 0, dpr = 1, slim = false, keys = [], cam = {}, cs = 1, sn = 0, ct = 1, st = 0, flatK = 0, floorH = FLOOR, flat = {}, railW = 50, headW = 44, pastK = 0, leftX = 360, bleed = 260;
  var YAW0 = -0.12, TILT0 = 0.98, FX = 600, FY = 340, OPEN_LIFT = 2.4;
  function layout() {
    vw = stage.clientWidth; vh = stage.clientHeight; dpr = Math.min(window.devicePixelRatio || 1, 2); slim = vw < 820;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    var logo = document.querySelector('.nav__logo'), edge = logo ? Math.round(logo.getBoundingClientRect().left) : 24;
    root.style.setProperty('--grand-edge', edge + 'px');
    placeWeek();

    var rect, rail, head, grid = moved ? weekBox.querySelector('.wk__grid') : null;
    if (grid) {
      var g = grid.getBoundingClientRect(), s0 = stage.getBoundingClientRect();
      rect = { x: g.left - s0.left, y: g.top - s0.top, w: g.width, h: g.height }; rail = 50; head = 40;
    } else if (slim) {
      rect = { x: 16, y: 88, w: vw - 32, h: Math.max(320, vh - 88 - 256) }; rail = 36; head = 32;
    } else {
      var left = edge + Math.min(460, vw * 0.36) + 24;
      rect = { x: left, y: 96, w: vw - edge - left, h: vh - 96 - 40 }; rail = 44; head = 36;
    }
    var fs = (rect.w - rail) / W, ky = ((rect.h - head) / H) / fs;
    flat = { s: fs, ky: ky, ox: rect.x + rail, oy: rect.y + head };
    railW = rail / fs; headW = head / (fs * ky);

    var base = slim ? Math.min(vw * 1.3 / 1000, vh * 0.5 / 520) : Math.min(vw * 0.58 / 1040, vh * 0.64 / 620);
    var open = slim ? Math.min(vw / 440, vh / 956) * 0.8 : Math.min(vw / 1440, vh / 900) * 1.35;
    var dive = slim ? base * 2.2 : base * 2.9, sx = slim ? 0.5 : 0.67, cx = (hero.x1 + hero.x2) / 2, cy = (hero.y1 + hero.y2) / 2;
    var opening = frameOpening({ s: open, ox: slim ? 0.5 : 0.694, oy: slim ? 0.8 : 0.84 });
    var first = { yaw: YAW0, tilt: TILT0, s: opening.s, ky: 1, x: FX, y: FY, ox: opening.ox, oy: opening.oy };
    var card = beats[2], cardTop = vh - (card ? card.offsetHeight : 170) - 28, riseFrame = slim ? frameLabels(-0.28, 0.66, FLOOR * 1.25, 84, cardTop, base * 1.9) : null;
    var rise = riseFrame ? { yaw: -0.28, tilt: 0.66, s: riseFrame.s, ky: 1, x: 0, y: 0, ox: riseFrame.ox, oy: riseFrame.oy } : { yaw: 0.54, tilt: 0.96, s: base * 1.1, ky: 1, x: W * 0.6, y: H * 0.5, ox: sx, oy: 0.56 };
    var last = { yaw: 0, tilt: 0, s: flat.s, ky: flat.ky, x: 0, y: 0, ox: flat.ox / vw, oy: flat.oy / vh };
    function at(p, k) { var o = {}; for (var n in k) o[n] = k[n]; o.p = p; return o; }
    keys = [
      at(0, first), at(0.09, first),
      { p: 0.24, yaw: -0.28, tilt: 0.86, s: base * (slim ? 1.4 : 1.08), ky: 1, x: W * (slim ? 0.5 : 0.42), y: H * 0.46, ox: sx, oy: slim ? 0.42 : 0.54 },
      at(0.34, rise), at(0.43, rise),
      { p: 0.54, yaw: -0.44, tilt: 0.92, s: dive, ky: 1, x: cx, y: cy, ox: sx, oy: slim ? 0.46 : 0.62 },
      { p: 0.72, yaw: -0.16, tilt: 0.88, s: dive * 1.08, ky: 1, x: cx, y: cy, ox: sx, oy: slim ? 0.46 : 0.64 },
      at(0.88, last), at(1, last)
    ];
  }
  function aim(p, mx, my) {
    var i = 0;
    while (i < keys.length - 2 && p > keys[i + 1].p) i++;
    var a = keys[i], b = keys[i + 1], t = smooth(seg(p, a.p, b.p)), calm = 1 - seg(p, 0.04, 0.1);
    cam = {
      yaw: lerp(a.yaw, b.yaw, t) + mx * 0.025 * calm, tilt: lerp(a.tilt, b.tilt, t) + my * 0.02 * calm,
      s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), t)), ky: lerp(a.ky, b.ky, t), x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
      ox: lerp(a.ox, b.ox, t) * vw, oy: lerp(a.oy, b.oy, t) * vh
    };
    cs = Math.cos(cam.yaw); sn = Math.sin(cam.yaw); ct = Math.cos(cam.tilt); st = Math.sin(cam.tilt);
    flatK = 1 - clamp(st / 0.35);
    floorH = FLOOR * lerp(OPEN_LIFT, 1.25, smooth(seg(p, 0.09, 0.24)));
    pastK = smooth(seg(p, 0.09, 0.175)); leftX = lerp(360, 0, pastK); bleed = 260 * (1 - pastK);
  }
  function pt(x, y, z) {
    var dx = x - cam.x, dy = (y - cam.y) * cam.ky;
    return [cam.ox + cam.s * (dx * cs - dy * sn), cam.oy + cam.s * ((dx * sn + dy * cs) * ct - z * st)];
  }
  function plane(z) {
    var o = pt(0, 0, z), s = cam.s, k = cam.ky;
    ctx.setTransform(dpr * s * cs, dpr * s * sn * ct, -dpr * s * sn * k, dpr * s * cs * ct * k, dpr * o[0], dpr * o[1]);
  }
  function screen() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function size(model, flatPx, minPx) { return Math.max(lerp(model, flatPx / cam.s, flatK), (minPx || 0) / cam.s); }
  function label(text, x, y, font, px) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / cam.ky); ctx.font = font.replace('$', px.toFixed(2)); ctx.fillText(text, 0, 0); ctx.restore();
  }
  function quad(a, b, c, d, fill) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.fill(); ctx.stroke();
  }
  function box(b, z1, z2, top, sideA, sideB) {
    screen();
    if (st > 0.015) {
      var fy = cs >= 0 ? b.y2 : b.y1, fx = sn >= 0 ? b.x2 : b.x1;
      quad(pt(b.x1, fy, z1), pt(b.x2, fy, z1), pt(b.x2, fy, z2), pt(b.x1, fy, z2), sideA);
      quad(pt(fx, b.y1, z1), pt(fx, b.y2, z1), pt(fx, b.y2, z2), pt(fx, b.y1, z2), sideB);
    }
    quad(pt(b.x1, b.y1, z2), pt(b.x2, b.y1, z2), pt(b.x2, b.y2, z2), pt(b.x1, b.y2, z2), top);
  }

  /* Drawing */
  function drawSheet() {
    box({ x1: leftX - railW, y1: -headW, x2: W + bleed, y2: H + bleed }, -20, 0, COL.paper, '#C9CEDF', '#A9B0C6');
    plane(0);
    var hair = Math.max(1 / cam.s, 0.6), r, rows = Math.floor((H + bleed) / CH), cols = Math.floor((W + bleed) / CW), firstCol = Math.ceil(leftX / CW - 0.001);
    ctx.lineWidth = hair; ctx.strokeStyle = COL.rule; ctx.beginPath();
    for (r = 0; r <= rows; r++) { ctx.moveTo(leftX, r * CH); ctx.lineTo(W + bleed, r * CH); }
    for (r = firstCol; r <= cols; r++) { ctx.moveTo(r * CW, -headW); ctx.lineTo(r * CW, H + bleed); }
    ctx.stroke();
    if (flatK < 1) {
      ctx.globalAlpha = 1 - flatK; ctx.beginPath();
      for (r = 0; r < rows; r++) { ctx.moveTo(leftX, (r + 0.5) * CH); ctx.lineTo(W + bleed, (r + 0.5) * CH); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    var gap = lerp(18, (slim ? 10 : 15) / cam.s, flatK), dayPx = size(14, slim ? 10 : 13, 8.5), numPx = size(16, slim ? 11 : 14, 9);
    DAYS.forEach(function (d, i) {
      var seen = i >= 3 ? 1 : clamp((i * CW - (leftX - railW)) / 36);
      if (seen <= 0) return;
      ctx.globalAlpha = seen;
      ctx.fillStyle = COL.muted; label(d, i * CW + CW / 2 - gap, -headW / 2, MEDIUM, dayPx);
      ctx.fillStyle = COL.navy; label(String(dateNum(i)), i * CW + CW / 2 + gap, -headW / 2, TIME, numPx);
    });
    ctx.globalAlpha = 1; ctx.textAlign = 'right'; ctx.fillStyle = COL.muted;
    var hourPx = size(12, slim ? 10 : 12, 8.5);
    for (var h = 8; h < 21; h += 2) label((h < 10 ? '0' : '') + h + ':00', leftX - 6 / cam.s, (h - 7) * CH, SEMI, hourPx);
  }
  function drawGaps(p) {
    plane(0);
    ctx.globalAlpha = lerp(0.55, 1, seg(p, 0.1, 0.18));
    ctx.setLineDash([7, 5]); ctx.lineWidth = lerp(2, 1.5 / cam.s, flatK); ctx.strokeStyle = COL.ghost;
    gaps.forEach(function (g) { ctx.beginPath(); ctx.roundRect(g.x1, g.y1, g.x2 - g.x1, g.y2 - g.y1, 5); ctx.stroke(); });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function drawShadows(state) {
    if (st < 0.05) return;
    plane(0); ctx.save();
    ctx.beginPath(); ctx.rect(leftX - railW, -headW, W + bleed - leftX + railW, H + bleed + headW); ctx.clip();
    ctx.fillStyle = 'rgba(27,35,64,' + (0.16 * clamp(st / 0.7)) + ')';
    columns.forEach(function (list) {
      list.forEach(function (b) {
        var a = state(b), h = (b.kind === 'class' ? 14 * a : (b.seats * floorH + CAP) * a) * st; if (h < 1) return;
        var dx = h * 0.62, dy = h * 0.34;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y1); ctx.lineTo(b.x2 + dx, b.y1 + dy); ctx.lineTo(b.x2 + dx, b.y2 + dy); ctx.lineTo(b.x1 + dx, b.y2 + dy); ctx.lineTo(b.x1, b.y2); ctx.closePath(); ctx.fill();
      });
    });
    ctx.restore();
  }
  function clipTop(b, z) {
    plane(z); ctx.save(); ctx.beginPath(); ctx.roundRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1, 4); ctx.clip();
  }
  function drawClass(b, a) {
    if (a <= 0) return;
    var z = 14 * a;
    box(b, 0, z, COL.paper, '#8B93AB', '#6F7792');
    clipTop(b, z);
    var step = lerp(8, 8.49 / cam.s, flatK), rise = (b.y2 - b.y1) * cam.ky;
    ctx.strokeStyle = 'rgba(27,35,64,' + lerp(0.13, 0.08, flatK) + ')'; ctx.lineWidth = lerp(1, 1.1 / cam.s, flatK); ctx.beginPath();
    for (var d = -rise; d < b.x2 - b.x1 + step; d += step) { ctx.moveTo(b.x1 + d, b.y2); ctx.lineTo(b.x1 + d + rise, b.y1); }
    ctx.stroke();
    var px = lerp(8, (slim ? 3 : 6.5) / cam.s, flatK), py = lerp(7, 4.5 / (cam.s * cam.ky), flatK), codePx = size(13, slim ? 8 : Math.min(12, (b.x2 - b.x1) * cam.s / 6.4), 8);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = COL.navy; label(b.code, b.x1 + px, b.y1 + py, BOLD, codePx);
    if (flatK < 0.5 && 11 * cam.s >= 8.5) { ctx.fillStyle = COL.muted; label(b.room, b.x1 + px, b.y1 + py + 17, MEDIUM, 11); }
    ctx.restore(); plane(z);
    ctx.lineWidth = lerp(2, 1.5 / cam.s, flatK); ctx.strokeStyle = COL.navy; ctx.beginPath(); ctx.roundRect(b.x1 + 0.5, b.y1 + 0.5, b.x2 - b.x1 - 1, b.y2 - b.y1 - 1, 4); ctx.stroke();
  }
  function openFloor(b, z, f, base) {
    box(b, z, z + f - 0.8, COL.paper, '#E7E9F0', '#CFD3DF');
    screen(); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = base; ctx.beginPath();
    var fy = cs >= 0 ? b.y2 : b.y1, fx = sn >= 0 ? b.x2 : b.x1, p1 = pt(b.x1, fy, z + f * 0.5), p2 = pt(b.x2, fy, z + f * 0.5), p3 = pt(fx, b.y1, z + f * 0.5), p4 = pt(fx, b.y2, z + f * 0.5);
    ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawSession(b, a, p) {
    if (a <= 0.01) return;
    var mine = b === hero, drop = mine ? seg(p, 0.6, 0.67) : 0, landed = drop >= 1;
    var f = floorH * a, lift = mine && drop > 0 && !landed ? Math.sin(Math.PI * drop) * f * 1.6 : 0, i, z;
    for (i = 0; i < b.taken; i++) box(b, i * f, (i + 1) * f - 0.8, b.colour, shade(b.colour, 0.22), shade(b.colour, 0.38));
    if (st > 0.04) {
      for (i = b.taken; i < b.seats; i++) {
        z = i * f;
        if (mine && i === b.taken) {
          if (landed) box(b, z, z + f - 0.8, COL.sun, shade(COL.sun, 0.18), shade(COL.sun, 0.32));
          else if (drop <= 0) openFloor(b, z, f, b.colour);
        } else openFloor(b, z + (mine ? lift : 0), f, b.colour);
      }
    }
    var roof = b.seats * f + lift, roofSun = mine && landed, cap = roofSun ? COL.sun : b.colour;
    box(b, roof, roof + CAP, cap, shade(cap, 0.22), shade(cap, 0.38));
    clipTop(b, roof + CAP);
    var timePx = size(21, 12.5, 10), namePx = size(12, 12), showName = (b.x2 - b.x1) * cam.s >= 72 && namePx * cam.s >= 8.5, unit = cam.s * cam.ky;
    var blockPx = (b.y2 - b.y1) * unit, flatTop = Math.max(2, (blockPx - (showName ? 26.5 : 13.5)) / 2) / unit, px = lerp(8, 6 / cam.s, flatK), py = lerp(6, flatTop, flatK), line = lerp(timePx * 1.14 / cam.ky, 13.5 / unit, flatK);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = b.light && !roofSun ? COL.white : COL.navy;
    label(b.start, b.x1 + px, b.y1 + py, TIME, timePx);
    if (showName) label(b.label, b.x1 + px, b.y1 + py + line, BOLD, namePx);
    ctx.restore();
    if (mine && drop > 0 && !landed) {
      var e = out(drop), off = (1 - e) * 190, up = (1 - e) * 70, flying = { x1: b.x1, x2: b.x2, y1: b.y1 + off, y2: b.y2 + off };
      z = b.taken * f + up;
      ctx.globalAlpha = clamp(drop * 4);
      box(flying, z, z + f - 0.8, COL.sun, shade(COL.sun, 0.18), shade(COL.sun, 0.32));
      ctx.globalAlpha = 1;
    }
  }
  function draw(p, t, mx, my) {
    aim(p, mx, my);
    screen(); ctx.clearRect(0, 0, vw, vh);
    function state(b) {
      var rise = still ? 1 : out(clamp((t - b.delay) / 0.85));
      if (b.kind === 'class') return b.day < 3 ? Math.min(rise, b.day === 0 ? out(seg(p, 0.172, 0.192)) : out(clamp((b.x1 - leftX) / 36))) : rise;
      var away = 1 - smooth(seg(p, 0.1, 0.17)), back = out(seg(p, 0.27 + b.day * 0.012, 0.36 + b.day * 0.012));
      return Math.max(away * rise, back);
    }
    drawSheet(); drawGaps(p); drawShadows(state);
    var order = DAYS.map(function (_, i) { return i; });
    if (sn < 0) order.reverse();
    order.forEach(function (d) {
      var list = columns[d].slice();
      if (cs < 0) list.reverse();
      list.forEach(function (b) { if (b.kind === 'class') drawClass(b, state(b)); else drawSession(b, state(b), p); });
    });
    screen();
  }

  /* Scroll, pointer and the story cards */
  var target = 0, cur = 0, mx = 0, my = 0, tx = 0, ty = 0, t0 = 0, frame = 0;
  function runEnd() { return root.offsetTop + root.offsetHeight - stage.offsetHeight; }
  function readScroll() {
    var r = root.getBoundingClientRect(), run = root.offsetHeight - stage.offsetHeight;
    target = run > 0 ? clamp(-r.top / run) : 0;
  }
  function showBeats(p) {
    beats.forEach(function (b) { b.classList.toggle('is-on', p >= +b.getAttribute('data-from') && p <= +b.getAttribute('data-to')); });
    if (live && moved) live.classList.toggle('is-on', p >= 0.91);
  }
  function tick(now) {
    frame = 0;
    if (!t0) t0 = now;
    var t = (now - t0) / 1000;
    cur += (target - cur) * 0.13; mx += (tx - mx) * 0.08; my += (ty - my) * 0.08;
    if (Math.abs(target - cur) < 0.0004) cur = target;
    draw(cur, t, mx, my); showBeats(cur);
    document.documentElement.classList.add('grand-ready');
    if (t < 1.6 || cur !== target || Math.abs(tx - mx) > 0.002 || Math.abs(ty - my) > 0.002) wake();
  }
  function wake() { if (!frame) frame = requestAnimationFrame(tick); }

  function start() {
    if (still) {
      root.classList.add('is-static'); layout(); draw(0, 9, 0, 0);
      window.addEventListener('resize', function () { layout(); draw(0, 9, 0, 0); });
      return;
    }
    document.documentElement.classList.add('grand-live'); layout(); readScroll(); cur = target; showBeats(cur); wake();
    window.addEventListener('scroll', function () { readScroll(); wake(); }, { passive: true });
    window.addEventListener('resize', function () { layout(); readScroll(); wake(); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href="#week"]');
      if (!a || !moved) return;
      e.preventDefault(); window.scrollTo({ top: runEnd(), behavior: 'smooth' });
    });
    if (moved && location.hash === '#week') window.scrollTo({ top: runEnd(), behavior: 'instant' });
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      stage.addEventListener('pointermove', function (e) { tx = e.clientX / vw * 2 - 1; ty = e.clientY / vh * 2 - 1; wake(); });
      stage.addEventListener('pointerleave', function () { tx = 0; ty = 0; wake(); });
    }
  }
  var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 expanded 20px Archivo'), document.fonts.load('700 12px "Hanken Grotesk"')]) : Promise.resolve();
  ready.then(start, start);
})();
