/* Approach Traffic Control site: the theme switcher, and a live radar scope drawn from the app's own
   airport files (airports.js). The traffic is a light demo, not the game's engine. */
(function () {
  "use strict";

  var THEMES = [
    { id: "phosphor", name: "Phosphor", free: true, line: "The classic scope. Green on black." },
    { id: "paper", name: "Paper", line: "Chart inks on ivory paper." },
    { id: "voltage", name: "Voltage", line: "Neon aqua and hot pink on violet." },
    { id: "ember", name: "Ember", line: "Bone white on deep oxblood." },
    { id: "blueprint", name: "Blueprint", line: "Chalk white on Prussian blue." },
    { id: "arcade", name: "Arcade", line: "Every neon at once, on black." },
    { id: "lantern", name: "Lantern", line: "Pumpkin and violet on a night sky." }
  ];
  var KEY = "atc.scope";
  var root = document.documentElement;
  var scopes = [];

  function store(get, v) {
    try { if (get) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch (e) { return null; }
  }
  function current() { return root.getAttribute("data-scope") || "phosphor"; }
  function setTheme(id) {
    if (!THEMES.some(function (t) { return t.id === id; })) id = "phosphor";
    root.setAttribute("data-scope", id);
    store(false, id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--field").trim();
    document.querySelectorAll("[data-theme-pick]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-pick") === id));
    });
    document.querySelectorAll("[data-theme-name]").forEach(function (n) {
      n.textContent = THEMES.filter(function (t) { return t.id === id; })[0].name;
    });
    scopes.forEach(function (s) { s.recolor(); });
  }
  var asked = (location.search.match(/[?&]theme=(\w+)/) || [])[1];
  setTheme(asked || store(true) || "phosphor");

  /* Theme popover in the nav. */
  function buildPicker() {
    var btn = document.querySelector(".themebtn");
    if (!btn) return;
    var pop = document.createElement("div");
    pop.className = "themepop glass";
    pop.hidden = true;
    pop.setAttribute("role", "menu");
    pop.innerHTML = THEMES.map(function (t) {
      return '<button role="menuitemradio" data-theme-pick="' + t.id + '" aria-pressed="' + (t.id === current()) + '">' +
        '<span class="sw" data-sw="' + t.id + '"></span>' + t.name +
        '<span class="tag' + (t.free ? " free" : "") + '">' + (t.free ? "FREE" : "PRO") + "</span></button>";
    }).join("");
    btn.parentNode.appendChild(pop);
    pop.querySelectorAll(".sw").forEach(function (sw) {
      var probe = document.createElement("i");
      probe.setAttribute("data-scope", sw.getAttribute("data-sw"));
      probe.style.display = "none";
      document.body.appendChild(probe);
      var cs = getComputedStyle(probe);
      sw.style.background = "conic-gradient(" + cs.getPropertyValue("--ink") + " 0 40%," + cs.getPropertyValue("--dep") + " 0 70%," + cs.getPropertyValue("--furn") + " 0)";
      sw.style.boxShadow = "inset 0 0 0 3px " + cs.getPropertyValue("--field") + ",0 0 0 1px rgba(128,128,128,.4)";
      probe.remove();
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      btn.setAttribute("aria-expanded", String(!pop.hidden));
    });
    document.addEventListener("click", function () { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") pop.hidden = true; });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-pick]");
    if (b) setTheme(b.getAttribute("data-theme-pick"));
  });

  /* ---------- The scope ---------- */

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FT_PER_NM = 6076;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function hdgVec(h) { var r = h * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; }
  function hdgTo(dx, dy) { var h = Math.atan2(dx, dy) * 180 / Math.PI; return (h + 360) % 360; }
  function turnToward(cur, want, max) {
    var d = ((want - cur + 540) % 360) - 180;
    if (Math.abs(d) <= max) return want;
    return (cur + (d > 0 ? max : -max) + 360) % 360;
  }
  function pad(n, w) { n = String(Math.max(0, Math.round(n))); while (n.length < w) n = "0" + n; return n; }

  function Scope(canvas, opts) {
    this.c = canvas;
    this.x = canvas.getContext("2d");
    this.o = opts || {};
    this.planes = [];
    this.stats = { ldg: 0, dep: 0, viol: 0, clock: 45 * 60 };
    this.sweep = 0;
    this.sel = null;
    this.storms = [];
    this.visible = true;
    this.setAirport(this.o.icao || "KSAN");
    this.recolor();
    this.resize();
    var self = this;
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); }).observe(canvas);
    else addEventListener("resize", function () { self.resize(); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; }).observe(canvas);
    }
    canvas.addEventListener("pointerdown", function (e) { self.tap(e); });
    scopes.push(this);
    this.last = performance.now();
    this.warm(reduce ? 90 : 45);
    if (reduce) this.draw();
    else requestAnimationFrame(function loop(t) { self.frame(t); requestAnimationFrame(loop); });
  }

  Scope.prototype.recolor = function () {
    var cs = getComputedStyle(root), k = {};
    ["field", "furn", "fix", "appr", "ink", "dep", "sel", "warn", "viol", "storm", "fg2"].forEach(function (n) {
      k[n] = cs.getPropertyValue("--" + n).trim();
    });
    this.k = k;
    if (reduce && this.w) this.draw();
  };

  Scope.prototype.setAirport = function (icao) {
    var a = window.ATC_AIRPORTS[icao];
    this.icao = icao;
    this.a = a;
    this.planes = [];
    this.sel = null;
    this.stats = { ldg: 0, dep: 0, viol: 0, clock: 45 * 60 };
    this.emit();
    var xs = a.boundary.map(function (p) { return p[0]; }), ys = a.boundary.map(function (p) { return p[1]; });
    this.box = { x0: Math.min.apply(0, xs), x1: Math.max.apply(0, xs), y0: Math.min.apply(0, ys), y1: Math.max.apply(0, ys) };
    var byId = {};
    a.runways.forEach(function (r) { byId[r.id] = r; });
    this.rw = byId;
    this.entries = a.fixes.filter(function (f) { return f.r === "entry"; });
    this.exits = a.fixes.filter(function (f) { return f.r === "departure_exit"; });
    this.storms = [];
    if (this.o.weather) {
      var n = 2;
      for (var i = 0; i < n; i++) {
        this.storms.push({ x: rnd(this.box.x0 * .6, this.box.x1 * .6), y: rnd(this.box.y0 * .6, this.box.y1 * .6),
          r: rnd(3.5, 6.5), vx: rnd(-.04, .04), vy: rnd(-.04, .04), seed: Math.random() * 10 });
      }
    }
    this.spawnT = 0;
    this.depT = 6;
    if (this.w) this.warm(reduce ? 90 : 40);
  };

  Scope.prototype.resize = function () {
    var r = this.c.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr);
    this.c.height = Math.round(r.height * dpr);
    this.x.setTransform(dpr, 0, 0, dpr, 0, 0);
    var b = this.box, fx = this.o.focus || [0.5, 0.5];
    var spanX = b.x1 - b.x0, spanY = b.y1 - b.y0;
    var zoom = this.o.zoom || 1;
    this.s = Math.min(r.width / spanX, r.height / spanY) * 0.92 * zoom;
    if (this.o.cover) this.s = Math.max(r.width / spanX, r.height / spanY) * 0.75 * zoom;
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (this.o.centerOnField) { cx = 0; cy = 0; }
    this.ox = r.width * fx[0] - cx * this.s;
    this.oy = r.height * fx[1] + cy * this.s;
    if (reduce) this.draw();
  };

  Scope.prototype.P = function (x, y) { return [this.ox + x * this.s, this.oy - y * this.s]; };

  /* A plane is an arrival flying gates to a join point to the threshold, or a departure. */
  Scope.prototype.spawnArrival = function () {
    if (!this.entries.length) return;
    var rwId = pick(this.a.land), rw = this.rw[rwId];
    if (!rw) return;
    var self = this, e = null;
    var tries = this.entries.slice().sort(function () { return Math.random() - .5; });
    for (var i = 0; i < tries.length && !e; i++) {
      var f = tries[i];
      if (!self.planes.some(function (p) { return Math.hypot(p.x - f.p[0], p.y - f.p[1]) < 9; })) e = f;
    }
    if (!e) return;
    var back = hdgVec((rw.h + 180) % 360);
    var side = [back[1], -back[0]];
    var s = Math.sign((e.p[0] * side[0] + e.p[1] * side[1])) || 1;
    var join = [rw.p[0] + back[0] * 12 + side[0] * s * 4, rw.p[1] + back[1] * 12 + side[1] * s * 4];
    var faf = [rw.p[0] + back[0] * 7, rw.p[1] + back[1] * 7];
    var emerg = this.o.emergencies && Math.random() < .14 ? pick(["FUEL", "MEDICAL", "ENGINE"]) : null;
    this.planes.push({
      kind: "arr", cs: pick(window.ATC_AIRLINES) + Math.floor(rnd(12, 990)),
      x: e.p[0], y: e.p[1], alt: e.a || 10000, spd: 280, hdg: hdgTo(join[0] - e.p[0], join[1] - e.p[1]),
      route: [join, faf, rw.p], leg: 0, rw: rwId, trail: [], emerg: emerg
    });
  };

  Scope.prototype.spawnDeparture = function () {
    if (!this.exits.length || !this.a.depart.length) return;
    var rw = this.rw[pick(this.a.depart)];
    if (!rw) return;
    if (this.planes.some(function (p) { return p.kind === "dep" && Math.hypot(p.x - rw.p[0], p.y - rw.p[1]) < 6; })) return;
    var v = hdgVec(rw.h), ex = pick(this.exits);
    this.planes.push({
      kind: "dep", cs: pick(window.ATC_AIRLINES) + Math.floor(rnd(12, 990)),
      x: rw.p[0] + v[0] * rw.l, y: rw.p[1] + v[1] * rw.l, alt: 400, spd: 170, hdg: rw.h,
      route: [[rw.p[0] + v[0] * 5, rw.p[1] + v[1] * 5], ex.p], leg: 0, trail: []
    });
  };

  /* dt in game seconds. */
  Scope.prototype.step = function (dt) {
    var self = this;
    this.spawnT -= dt; this.depT -= dt;
    var arrivals = this.planes.filter(function (p) { return p.kind === "arr"; }).length;
    var cap = this.o.busy ? 7 : 4;
    if (this.spawnT <= 0) { if (arrivals < cap) this.spawnArrival(); this.spawnT = rnd(70, 130) / (this.o.busy ? 1.6 : 1); }
    if (this.depT <= 0) { this.spawnDeparture(); this.depT = rnd(110, 200); }

    this.planes.forEach(function (p) {
      var tgt = p.route[p.leg];
      var dx = tgt[0] - p.x, dy = tgt[1] - p.y, dist = Math.hypot(dx, dy);
      if (p.kind === "arr") {
        var final = p.leg >= 1;
        var want = final ? (p.leg === 2 ? 150 : 180) : 250;
        // Keep spacing: slow down behind another arrival on the same runway.
        self.planes.forEach(function (q) {
          if (q !== p && q.kind === "arr" && q.rw === p.rw && q.leg >= p.leg) {
            var a = Math.hypot(q.x - p.x, q.y - p.y);
            if (a < 5 && self.pathLeft(q) < self.pathLeft(p)) want = Math.min(want, 160);
          }
        });
        p.spd += Math.max(-1.5 * dt, Math.min(1.5 * dt, want - p.spd));
        var left = self.pathLeft(p);
        var goal = p.leg === 2 ? Math.min(3000, left * 318) : final ? 3000 : Math.max(3000, Math.min(p.alt, 3000 + (left - 8) * 400));
        p.alt += Math.max(-25 * dt, Math.min(25 * dt, goal - p.alt));
        p.hdg = turnToward(p.hdg, hdgTo(dx, dy), (p.leg === 2 ? 6 : 3) * dt);
        if (dist < (p.leg === 2 ? 0.35 : 1.2)) {
          if (p.leg < 2) p.leg++;
          else { p.done = true; self.stats.ldg++; }
        }
      } else {
        p.spd += Math.max(-2 * dt, Math.min(2 * dt, 250 - p.spd));
        p.alt = Math.min(10000, p.alt + 35 * dt);
        if (p.alt > 1500) p.hdg = turnToward(p.hdg, hdgTo(dx, dy), 3 * dt);
        if (p.leg === 0 && dist < 1) p.leg = 1;
        if (p.leg === 1 && dist < 1.5) { p.done = true; self.stats.dep++; }
      }
      var v = hdgVec(p.hdg), nm = p.spd / 3600 * dt;
      p.x += v[0] * nm; p.y += v[1] * nm;
      if (Math.abs(p.x) > 80 || Math.abs(p.y) > 80) p.done = true;
    });
    if (this.sel && this.sel.done) this.sel = null;
    this.planes = this.planes.filter(function (p) { return !p.done; });
    this.storms.forEach(function (s) { s.x += s.vx * dt / 10; s.y += s.vy * dt / 10; });
    this.stats.clock = Math.max(0, this.stats.clock - dt);
    if (this.stats.clock === 0 || this.stats.ldg >= 30) this.stats = { ldg: 0, dep: 0, viol: 0, clock: 45 * 60 };
  };

  Scope.prototype.pathLeft = function (p) {
    var d = 0, x = p.x, y = p.y;
    for (var i = p.leg; i < p.route.length; i++) { d += Math.hypot(p.route[i][0] - x, p.route[i][1] - y); x = p.route[i][0]; y = p.route[i][1]; }
    return d;
  };

  Scope.prototype.warm = function (n) {
    for (var i = 0; i < n; i++) {
      this.step(4);
      if (i % 3 === 0) this.trail();
    }
  };
  Scope.prototype.trail = function () {
    this.planes.forEach(function (p) { p.trail.unshift([p.x, p.y]); if (p.trail.length > 5) p.trail.pop(); });
  };

  Scope.prototype.frame = function (t) {
    var dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (!this.visible || document.hidden) return;
    var speed = this.o.speed || 8;
    var prev = this.sweep;
    this.sweep = (this.sweep + dt * 360 / 4) % 360;
    this.step(dt * speed);
    if (this.sweep < prev) { this.trail(); }
    this.tick = (this.tick || 0) + dt;
    if (this.tick > 0.25) { this.tick = 0; this.emit(); }
    this.draw();
  };

  Scope.prototype.emit = function () {
    if (this.o.onStats) this.o.onStats(this.stats, this);
    if (this.o.onSelect) this.o.onSelect(this.sel, this);
  };

  Scope.prototype.tap = function (e) {
    var r = this.c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var best = null, bd = 34, self = this;
    this.planes.forEach(function (p) {
      var q = self.P(p.x, p.y), d = Math.hypot(q[0] - mx, q[1] - my);
      if (d < bd) { bd = d; best = p; }
    });
    this.sel = best === this.sel ? null : best;
    this.emit();
    if (reduce) this.draw();
  };

  Scope.prototype.draw = function () {
    var g = this.x, k = this.k, a = this.a, self = this, s = this.s;
    var small = this.w < 640;
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = k.field; g.fillRect(0, 0, this.w, this.h);

    function path(pts, closed) {
      g.beginPath();
      for (var i = 0; i < pts.length; i += 2) {
        var q = self.P(pts[i], pts[i + 1]);
        if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
      }
      if (closed) g.closePath();
    }
    // Geography
    a.bg.forEach(function (b) {
      path(b.p, b.c);
      if (b.c && b.k === "w") { g.fillStyle = k.furn; g.globalAlpha = .1; g.fill(); }
      g.globalAlpha = .45; g.strokeStyle = k.furn; g.lineWidth = 1; g.stroke();
      g.globalAlpha = 1;
    });
    // Range rings around the field
    var c0 = this.P(0, 0);
    g.strokeStyle = k.furn; g.globalAlpha = .28; g.lineWidth = 1;
    for (var rr = 10; rr <= 60; rr += 10) { g.beginPath(); g.arc(c0[0], c0[1], rr * s, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 1;
    // Airspace
    var bp = []; a.boundary.forEach(function (p) { bp.push(p[0], p[1]); });
    path(bp, true); g.strokeStyle = k.furn; g.globalAlpha = .55; g.lineWidth = 1.2; g.stroke(); g.globalAlpha = 1;
    // Weather
    this.storms.forEach(function (st) {
      var q = self.P(st.x, st.y), R = st.r * s;
      var grd = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
      grd.addColorStop(0, k.storm); grd.addColorStop(1, "transparent");
      g.globalAlpha = .38; g.fillStyle = grd;
      g.beginPath();
      for (var i = 0; i <= 12; i++) {
        var ang = i / 12 * Math.PI * 2, rr2 = R * (0.75 + 0.25 * Math.sin(ang * 3 + st.seed));
        var px = q[0] + Math.cos(ang) * rr2, py = q[1] + Math.sin(ang) * rr2;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.fill(); g.globalAlpha = 1;
    });
    // Approach course: dashed centerline with mile ticks
    a.land.forEach(function (id) {
      var rw = self.rw[id]; if (!rw) return;
      var back = hdgVec((rw.h + 180) % 360), q0 = self.P(rw.p[0], rw.p[1]);
      var q1 = self.P(rw.p[0] + back[0] * 15, rw.p[1] + back[1] * 15);
      g.setLineDash([3, 5]); g.strokeStyle = k.appr; g.globalAlpha = .55; g.lineWidth = 1;
      g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); g.setLineDash([]);
      for (var m = 2; m <= 14; m += 2) {
        var t = self.P(rw.p[0] + back[0] * m, rw.p[1] + back[1] * m), n = [back[1] * 3, -back[0] * 3];
        g.beginPath(); g.moveTo(t[0] - n[0], t[1] + n[1]); g.lineTo(t[0] + n[0], t[1] - n[1]); g.stroke();
      }
      g.globalAlpha = 1;
    });
    // Runways
    a.runways.forEach(function (rw) {
      var v = hdgVec(rw.h), q0 = self.P(rw.p[0], rw.p[1]), q1 = self.P(rw.p[0] + v[0] * rw.l, rw.p[1] + v[1] * rw.l);
      g.strokeStyle = k.fix; g.lineWidth = Math.max(2, s * .12); g.lineCap = "round";
      g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.stroke(); g.lineCap = "butt";
    });
    // Fixes and landmarks
    g.font = (small ? 9 : 10.5) + "px ui-monospace,SFMono-Regular,Menlo,monospace";
    g.textAlign = "center";
    a.fixes.forEach(function (f) {
      if (f.r !== "landmark") return;
      var q = self.P(f.p[0], f.p[1]);
      if (q[0] < -40 || q[1] < -20 || q[0] > self.w + 40 || q[1] > self.h + 20) return;
      var lm = f.r === "landmark";
      if (lm && (small || self.o.landmarks === false)) return;
      g.strokeStyle = k.fix; g.fillStyle = lm ? k.fix : k.fix; g.globalAlpha = lm ? .6 : .9; g.lineWidth = 1;
      g.beginPath();
      if (lm) { g.arc(q[0], q[1], 1.8, 0, Math.PI * 2); g.fill(); }
      else { g.moveTo(q[0], q[1] - 4); g.lineTo(q[0] + 4, q[1] + 3); g.lineTo(q[0] - 4, q[1] + 3); g.closePath(); g.stroke(); }
      if (f.n) g.fillText(f.n, q[0], q[1] + 13);
      g.globalAlpha = 1;
    });
    // Sweep
    if (!reduce) {
      var R = Math.hypot(this.w, this.h);
      var ang = (this.sweep - 90) * Math.PI / 180;
      if (g.createConicGradient) {
        var cg = g.createConicGradient(ang - 0.9, c0[0], c0[1]);
        cg.addColorStop(0, "transparent"); cg.addColorStop(0.143, k.ink); cg.addColorStop(0.1431, "transparent"); cg.addColorStop(1, "transparent");
        g.globalAlpha = .1; g.fillStyle = cg; g.beginPath(); g.moveTo(c0[0], c0[1]); g.arc(c0[0], c0[1], R, ang - 0.9, ang); g.closePath(); g.fill();
      }
      g.globalAlpha = .35; g.strokeStyle = k.ink; g.lineWidth = 1;
      g.beginPath(); g.moveTo(c0[0], c0[1]); g.lineTo(c0[0] + Math.cos(ang) * R, c0[1] + Math.sin(ang) * R); g.stroke();
      g.globalAlpha = 1;
    }
    // Conflicts: under 3 NM and 1,000 ft
    var close = {};
    for (var i = 0; i < this.planes.length; i++) for (var j = i + 1; j < this.planes.length; j++) {
      var p = this.planes[i], q = this.planes[j];
      if (Math.hypot(p.x - q.x, p.y - q.y) < 3 && Math.abs(p.alt - q.alt) < 1000 && p.leg < 2 && q.leg < 2) { close[i] = close[j] = 1; }
    }
    // Traffic
    g.textAlign = "left";
    g.font = "600 " + (small ? 10 : 11.5) + "px ui-monospace,SFMono-Regular,Menlo,monospace";
    this.planes.forEach(function (p, idx) {
      var q = self.P(p.x, p.y), ink = p.emerg ? k.viol : p.kind === "dep" ? k.dep : k.ink;
      if (p === self.sel) ink = k.sel;
      g.fillStyle = ink; g.strokeStyle = ink;
      p.trail.forEach(function (t, n) {
        var tq = self.P(t[0], t[1]); g.globalAlpha = .5 - n * .08;
        g.beginPath(); g.arc(tq[0], tq[1], 1.6, 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1;
      var v = hdgVec(p.hdg), lead = p.spd / 60 * s;
      g.lineWidth = 1.2; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + v[0] * lead, q[1] - v[1] * lead); g.stroke();
      if (p.kind === "dep") { g.beginPath(); g.arc(q[0], q[1], 4, 0, Math.PI * 2); g.lineWidth = 1.6; g.stroke(); }
      else { g.lineWidth = 1.6; g.strokeRect(q[0] - 4, q[1] - 4, 8, 8); }
      if (p === self.sel) { g.beginPath(); g.arc(q[0], q[1], 11, 0, Math.PI * 2); g.lineWidth = 1.4; g.stroke(); }
      if (close[idx]) { g.strokeStyle = k.warn; g.beginPath(); g.arc(q[0], q[1], 3 * s / 2, 0, Math.PI * 2); g.lineWidth = 1.2; g.stroke(); }
      var tx = q[0] + 9, ty = q[1] - 12;
      g.shadowColor = ink; g.shadowBlur = 6;
      g.fillText(p.cs, tx, ty);
      g.fillText(pad(p.alt / 100, 3) + " " + pad(p.spd / 10, 2), tx, ty + 13);
      if (p.emerg) g.fillText(p.emerg, tx, ty + 26);
      g.shadowBlur = 0;
    });
  };

  window.ATCScope = { mount: function (c, o) { return new Scope(c, o); }, themes: THEMES, setTheme: setTheme, pad: pad };

  /* Reveal on scroll */
  function reveal() {
    var els = document.querySelectorAll(".reveal");
    if (!window.IntersectionObserver || reduce) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { buildPicker(); reveal(); setTheme(current()); });
  else { buildPicker(); reveal(); setTheme(current()); }
})();
