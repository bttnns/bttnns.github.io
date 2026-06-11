(function () {
  var btn = document.getElementById("theme-toggle");
  var root = document.documentElement;
  var term = document.querySelector(".term");
  var pre = document.querySelector(".term-body pre");
  var preHTML = pre ? pre.innerHTML : null; // pristine markup, restored on exit
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var order = ["system", "light", "professional", "night"];
  var busy = false;

  // background eases over while the terminal is hidden; hold a touch longer so
  // the change has fully settled before the card fades back in.
  var HOLD = 600;

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
    "--bg", "--panel", "--panel-bar", "--panel-line", "--ink",
    "--key", "--string", "--comment", "--punct", "--glitch-op", "--shadow"
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
    return {
      "--bg":         hsl(h, rand(60, 80), rand(5, 8)),
      "--panel":      hsl(h, rand(55, 75), rand(9, 13)),
      "--panel-bar":  hsl(h, rand(55, 75), rand(13, 18)),
      "--panel-line": hsl(key, rand(85, 100), rand(26, 34)),
      "--ink":        hsl(h, rand(35, 55), rand(90, 95)),
      "--key":        hsl(key, 100, rand(62, 72)),
      "--string":     hsl(str, 100, rand(58, 68)),
      "--comment":    hsl(str, rand(60, 80), rand(58, 66)),
      "--punct":      hsl(key, rand(65, 85), rand(46, 56)),
      "--glitch-op":  rand(0.4, 0.6).toFixed(2),
      "--shadow":     "0 2px 10px rgba(0, 0, 0, 0.6), 0 0 18px " +
                      hsl(key, 100, 65, 0.45) + ", 0 0 55px " +
                      hsl(key, 95, 62, 0.42) + ", 0 0 100px " +
                      hsl(key, 90, 60, 0.32) + ", 0 0 70px " +
                      hsl(str, 95, 60, 0.34) + ", 0 30px 90px " +
                      hsl(str, 90, 55, 0.22)
    };
  }

  function setNight(p) {
    Object.keys(p).forEach(function (v) { root.style.setProperty(v, p[v]); });
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
    render();
  }

  function nextTheme() {
    return order[(order.indexOf(current()) + 1) % order.length];
  }

  btn.addEventListener("click", function () {
    var next = nextTheme();

    if (busy || reduce.matches || !term) {
      apply(next);
      return;
    }
    busy = true;
    var prevBg = getComputedStyle(root).getPropertyValue("--bg").trim();

    // 1. fade the whole terminal away
    term.classList.add("repainting");
    term.addEventListener("transitionend", function out(e) {
      if (e.propertyName !== "opacity") return;
      term.removeEventListener("transitionend", out);

      // 2. swap theme while hidden, letting the background ease over
      apply(next);

      // 3. only wait for the page background to settle if it actually changed;
      //    otherwise just fade the window back in right away
      var bgChanged = getComputedStyle(root).getPropertyValue("--bg").trim() !== prevBg;
      setTimeout(function () {
        term.classList.remove("repainting");
        term.addEventListener("transitionend", function back(e2) {
          if (e2.propertyName !== "opacity") return;
          term.removeEventListener("transitionend", back);
          busy = false;
          // entry fade has settled on a dark palette: now start the slow drift
          if (current() === "night") {
            root.classList.add("drift");
            startNightCycle();
          }
        });
      }, bgChanged ? HOLD : 0);
    });
  });

  render();
})();
