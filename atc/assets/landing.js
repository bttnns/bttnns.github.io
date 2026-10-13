(function () {
  "use strict";
  var S = window.ATCScope, pad = S.pad;

  // Every date from 1 January 2000 to today is a shift.
  var now = new Date();
  var days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2000, 0, 1)) / 864e5) + 1;
  document.getElementById("days").textContent = days.toLocaleString("en-US");

  // The hero scope, and the card for a tapped plane.
  var card = document.getElementById("hero-card"), hero = document.querySelector(".hero");
  var wide = matchMedia("(min-width: 52rem)").matches, picked = false;
  S.mount(document.getElementById("hero-scope"), {
    icao: "KSAN", busy: true, focus: wide ? [0.68, 0.5] : [0.5, 0.42], cover: true, zoom: wide ? 1.3 : 1.5, centerOnField: true,
    onStats: function (st, sc) {
      document.getElementById("h-ldg").textContent = st.ldg + "/30";
      document.getElementById("h-dep").textContent = st.dep;
      var t = Math.round(st.clock);
      document.getElementById("h-clock").textContent = Math.floor(t / 60) + ":" + pad(t % 60, 2);
      if (!picked && wide) {
        var a = sc.planes.filter(function (p) { return p.kind === "arr" && p.leg === 0; })[0];
        if (a) { sc.sel = a; picked = true; }
      }
    },
    onSelect: function (p, sc) {
      if (!p) { card.hidden = true; return; }
      card.hidden = false;
      card.innerHTML = '<div class="cs">' + p.cs + '</div><div class="who">' + (p.kind === "arr" ? "Arrival" : "Departure") + "</div>" +
        '<div class="rows"><div>ALT<b>' + Math.round(p.alt / 100) * 100 + "</b></div><div>SPD<b>" + Math.round(p.spd) +
        "</b></div><div>HDG<b>" + pad(p.hdg, 3) + "</b></div></div>";
      var q = sc.P(p.x, p.y), r = hero.getBoundingClientRect();
      card.style.left = Math.min(Math.max(q[0] + 24, 12), r.width - card.offsetWidth - 12) + "px";
      card.style.top = Math.min(Math.max(q[1] - card.offsetHeight - 20, 70), r.height - card.offsetHeight - 80) + "px";
    }
  });
  addEventListener("pointerdown", function () { picked = true; }, { once: true });

  // Airports
  var PORTS = [
    { icao: "KSAN", code: "SAN", free: true, line: "One runway between the ocean and the hills. The place to learn." },
    { icao: "KAUS", code: "AUS", line: "Two long runways in the Texas Hill Country." },
    { icao: "KPIT", code: "PIT", line: "Four runways and three rivers." },
    { icao: "KPBI", code: "PBI", line: "Three runways on the Florida coast, and storms off the sea." },
    { icao: "KSEA", code: "SEA", line: "Tight parallel runways and Mt. Rainier. The hardest one." }
  ];
  var tabs = document.getElementById("port-tabs"), info = document.getElementById("port-info");
  var map = S.mount(document.getElementById("port-scope"), { icao: "KSAN" });
  function show(port) {
    map.o.weather = map.o.emergencies = map.o.busy = !port.free;
    map.setAirport(port.icao); map.resize();
    tabs.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.icao === port.icao)); });
    info.innerHTML = '<p class="kicker">' + port.icao + ' <span class="badge' + (port.free ? " solid" : "") + '">' +
      (port.free ? "FREE" : "PRO") + "</span></p><h3>" + ATC_AIRPORTS[port.icao].name + '</h3><p class="dim">' + port.line + "</p>";
  }
  PORTS.forEach(function (p) {
    var b = document.createElement("button");
    b.setAttribute("role", "tab"); b.dataset.icao = p.icao;
    b.innerHTML = p.code + "<small>" + (p.free ? "FREE" : "PRO") + "</small>";
    b.addEventListener("click", function () { show(p); });
    tabs.appendChild(b);
  });
  show(PORTS[0]);

  // Themes
  document.getElementById("theme-grid").innerHTML = S.themes.map(function (t) {
    return '<button class="theme" data-theme-pick="' + t.id + '" aria-pressed="false"><img src="/atc/img/icon-' + t.id +
      '.png" alt="" width="60" height="60" loading="lazy"><div><b>' + t.name + "</b><span>" + t.line + '</span><div class="t' +
      (t.free ? " free" : "") + '">' + (t.free ? "FREE" : "PRO") + "</div></div></button>";
  }).join("");
  S.setTheme(document.documentElement.getAttribute("data-scope"));
})();
