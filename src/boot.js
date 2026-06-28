/* =============================================================================
 * Boot — wires the framework to the DOM: tab nav, initial compute, home page.
 * ===========================================================================*/
(function (root) {
  "use strict";
  var ctl = root.ctl, view = root.view, doc = root.document;

  var NAV = [
    { id: "home", label: "Flight Performance" },
    { id: "aircraft", label: "Aircraft" },
    { id: "wb", label: "Weight & Balance" },
    { id: "departure", label: "Departure" },
    { id: "climb", label: "Climb" },
    { id: "enroute", label: "Enroute" },
    { id: "destination", label: "Destination" },
    { id: "settings", label: "Settings" }
  ];
  var home = { initial: "home" };
  root.home = home;

  home.select = function (id) {
    ctl.current(id);
    Array.prototype.forEach.call(doc.querySelectorAll("#f-nav .f-tab"), function (b) {
      b.classList.toggle("sel", b.getAttribute("data-page") === id);
    });
    view.render();
    var m = doc.getElementById("f-main"); if (m && m.scrollTo) m.scrollTo(0, 0);
  };

  function buildNav() {
    doc.getElementById("f-nav").innerHTML = NAV.map(function (n) {
      return "<button class='f-tab' data-page='" + n.id + "' onclick=\"home.select('" + n.id + "')\">" + n.label + "</button>";
    }).join("");
  }

  home.start = function () {
    view.mount = doc.getElementById("f-main");
    if (root.pp && root.pp.applyTheme) root.pp.applyTheme();
    ctl.init();
    buildNav();
    ctl.change();
    home.select(home.initial);
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", home.start);
  else home.start();
})(typeof window !== "undefined" ? window : globalThis);
