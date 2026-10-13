(function () {
  "use strict";
  var wide = matchMedia("(min-width: 52rem)").matches;
  window.ATCScope.mount(document.getElementById("hero-scope"), {
    icao: "KSAN", busy: true, focus: wide ? [0.68, 0.5] : [0.5, 0.42], cover: true, zoom: wide ? 1.3 : 1.5, centerOnField: true
  });
})();
