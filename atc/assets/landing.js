(function () {
  "use strict";
  var S = window.ATCScope;
  var wide = matchMedia("(min-width: 52rem)").matches;
  S.mount(document.getElementById("hero-scope"), {
    icao: "KSAN", busy: true, focus: wide ? [0.68, 0.5] : [0.5, 0.42], cover: true, zoom: wide ? 1.3 : 1.5, centerOnField: true
  });

  // The PRO showcase: the busier airports, with weather and emergencies on.
  var pro = S.mount(document.getElementById("pro-scope"), {
    icao: "KSEA", weather: true, emergencies: true, busy: true, cover: true, zoom: 1.25, centerOnField: true
  });
  var tabs = document.getElementById("port-tabs");
  ["SEA", "PBI", "PIT", "AUS"].forEach(function (code, i) {
    var b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === 0));
    b.textContent = code;
    b.addEventListener("click", function () {
      pro.setAirport("K" + code); pro.resize();
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
    });
    tabs.appendChild(b);
  });
})();
