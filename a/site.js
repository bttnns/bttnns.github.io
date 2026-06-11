(function () {
  var btn = document.getElementById("theme-toggle");
  var root = document.documentElement;

  function current() {
    return root.dataset.theme || "system";
  }

  function render() {
    btn.textContent = "theme: " + current();
  }

  btn.addEventListener("click", function () {
    var order = ["system", "light", "professional", "dark"];
    var next = order[(order.indexOf(current()) + 1) % order.length];
    if (next === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = next;
    }
    render();
  });

  render();
})();
