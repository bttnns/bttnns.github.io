(function () {
  var btn = document.getElementById("theme-toggle");
  var themeColor = document.getElementById("theme-color");
  var root = document.documentElement;
  var pre = document.querySelector(".term-body pre");
  var preHTML = pre ? pre.innerHTML : null; // pristine markup, restored on exit
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var order = ["system", "light", "professional", "night"];

  function current() {
    return root.dataset.theme || "system";
  }

  function render() {
    btn.textContent = "theme: " + current();
  }

  // night is a randomized theme: a dark window in a random hue with two vivid,
  // well-spaced accents. set inline on :root so it overrides the static night
  // block, and cleared when leaving night so other themes are untouched.
  var NIGHT_VARS = [
    "--bg", "--panel", "--panel-bar", "--panel-line", "--panel-line-max", "--ink",
    "--key", "--string", "--comment", "--punct", "--glitch-op", "--shadow", "--shadow-max"
  ];

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function hsl(h, s, l, a) {
    h = Math.round(h) % 360;
    var c = "hsl(" + h + " " + Math.round(s) + "% " + Math.round(l) + "%";
    return c + (a == null ? ")" : " / " + a + ")");
  }

  function nightPalette() {
    var h = rand(0, 360);
    var key = (h + rand(140, 220)) % 360;   // bold, near-complementary accent
    var str = (h + rand(80, 140)) % 360;    // a clashing second accent

    // a 6-layer glow whose colour-layer alphas scale with m (the black drop
    // shadow stays put); same offsets/blur so the two pulse-ends interpolate.
    function glow(m) {
      function a(x) { return Math.min(x * m, 0.9).toFixed(2); }
      return "0 2px 10px rgba(0, 0, 0, 0.6), 0 0 18px " +
             hsl(key, 100, 65, a(0.45)) + ", 0 0 55px " +
             hsl(key, 95, 62, a(0.42)) + ", 0 0 100px " +
             hsl(key, 90, 60, a(0.32)) + ", 0 0 70px " +
             hsl(str, 95, 60, a(0.34)) + ", 0 30px 90px " +
             hsl(str, 90, 55, a(0.22));
    }
    var lineSat = rand(85, 100);
    return {
      "--bg":             hsl(h, rand(60, 80), rand(5, 8)),
      "--panel":          hsl(h, rand(55, 75), rand(9, 13)),
      "--panel-bar":      hsl(h, rand(55, 75), rand(13, 18)),
      "--panel-line":     hsl(key, lineSat, rand(26, 34)),  // medium border
      "--panel-line-max": hsl(key, 100, rand(52, 64)),      // peak border
      "--ink":            hsl(h, rand(35, 55), rand(90, 95)),
      "--key":            hsl(key, 100, rand(62, 72)),
      "--string":         hsl(str, 100, rand(58, 68)),
      "--comment":        hsl(str, rand(60, 80), rand(58, 66)),
      "--punct":          hsl(key, rand(65, 85), rand(46, 56)),
      "--glitch-op":      rand(0.4, 0.6).toFixed(2),
      "--shadow":         glow(0.75),  // medium glow
      "--shadow-max":     glow(1.5)    // peak glow
    };
  }

  function setNight(p) {
    Object.keys(p).forEach(function (v) { root.style.setProperty(v, p[v]); });
  }

  function syncTitlebar() {
    if (themeColor) {
      themeColor.content = getComputedStyle(root).getPropertyValue("--bg").trim();
    }
  }

  // wrap each line of the yaml in a .ln span so the base (non-token) text on
  // each line can take its own random colour; tokens keep their accent colours.
  function wrapLines() {
    if (!pre || pre.dataset.wrapped) return;
    pre.innerHTML = preHTML.split("\n").map(function (frag) {
      return '<span class="ln">' + frag + "</span>";
    }).join("\n");
    pre.dataset.wrapped = "1";
  }
  function unwrapLines() {
    if (!pre || !pre.dataset.wrapped) return;
    pre.innerHTML = preHTML;
    delete pre.dataset.wrapped;
  }
  function colorLines() {
    if (!pre) return;
    [].forEach.call(pre.querySelectorAll(".ln"), function (ln) {
      ln.style.color = hsl(rand(0, 360), rand(72, 100), rand(66, 80));
    });
  }

  // a full night roll: new palette + fresh per-line colours
  function rollNight() {
    setNight(nightPalette());
    colorLines();
  }

  // while night is active, roll a new palette every 13s; CSS eases the colors
  // so the scene drifts between random themes. paused for reduced-motion.
  var NIGHT_MS = 13000;
  var nightTimer = null;
  function startNightCycle() {
    stopNightCycle();
    if (reduce.matches) return;
    nightTimer = setInterval(rollNight, NIGHT_MS);
  }
  function stopNightCycle() {
    if (nightTimer) { clearInterval(nightTimer); nightTimer = null; }
  }

  function apply(next) {
    if (next === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = next;
    }
    if (next === "night") {
      wrapLines();
      rollNight();
    } else {
      NIGHT_VARS.forEach(function (v) { root.style.removeProperty(v); });
      unwrapLines();
      root.classList.remove("drift");
      stopNightCycle();
    }
    syncTitlebar(); // one discrete update per switch, not sampling the fade
    render();
  }

  function nextTheme() {
    return order[(order.indexOf(current()) + 1) % order.length];
  }

  // once the switch has settled on a dark night palette, kick off the slow
  // ambient drift (CSS .drift + a fresh roll every 13s). harmless for others.
  function afterSwitch() {
    if (current() === "night") {
      root.classList.add("drift");
      startNightCycle();
    }
  }

  btn.addEventListener("click", function () {
    var next = nextTheme();

    // View Transitions API: the browser snapshots the page, runs apply() to
    // swap the theme, then crossfades old -> new in one pass (CSS tunes the
    // asymmetric in/out timing). fall back to an instant swap when it's
    // unavailable or the user prefers reduced motion.
    if (reduce.matches || !document.startViewTransition) {
      apply(next);
      afterSwitch();
      return;
    }

    var vt = document.startViewTransition(function () { apply(next); });
    vt.finished.then(afterSwitch);
  });

  syncTitlebar();
  render();
})();
