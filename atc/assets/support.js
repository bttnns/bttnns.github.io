(function () {
  var copy = document.getElementById("copy");
  copy.addEventListener("click", function () {
    var done = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy address"; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText("atc@t5s.io").then(done, function () {});
  });
  var q = document.getElementById("q"), items = document.querySelectorAll("#faq details"), heads = document.querySelectorAll("#faq > .kicker");
  q.addEventListener("input", function () {
    var t = q.value.trim().toLowerCase(), any = false;
    items.forEach(function (d) {
      var hit = !t || d.textContent.toLowerCase().indexOf(t) > -1;
      d.hidden = !hit; if (hit) any = true;
      d.open = !!t && hit;
    });
    heads.forEach(function (h) { h.hidden = !!t; });
    document.getElementById("none").hidden = any;
  });
})();
