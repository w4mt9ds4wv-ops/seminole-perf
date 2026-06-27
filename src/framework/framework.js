/* =============================================================================
 * PA-44-180 SEMINOLE — clean-room MVC framework core.
 *
 * Re-implements the *documented* patterns from the reference framework README
 * (state variables declared in stateInfo, JSON view templates, computeInfo
 * dependency-driven controller, Ptable interpolation, CGenvelope) as original
 * code. It deliberately OMITS the proprietary product's networked features
 * (Cloud Sync, METAR fetch, airport/runway DB, PHP web services) — this tool
 * is strictly offline / no-network / no-telemetry.
 *
 * Runs from file:// (Mac double-click) and as an installed PWA.
 * ===========================================================================*/
(function (root) {
  "use strict";

  /* ---- invalid-value constants (per README) ---------------------------- */
  root.INVALID       = NaN;            // general invalid (alias of NaN)
  root.INVALID_NULL  = "\u0000NULL";   // invalid, display "-"
  root.INVALID_INPUT = "\u0000INPUT";  // invalid because an input was invalid
  root.INVALID_POH   = "\u0000POH";    // invalid because outside POH envelope
  function isInvalid(v) {
    return v === root.INVALID_NULL || v === root.INVALID_INPUT ||
           v === root.INVALID_POH  || (typeof v === "number" && isNaN(v));
  }

  /* ===========================================================================
   * Math + aeronautical utility functions (subset of the README's aero set)
   * ==========================================================================*/
  function round(v, digits) {
    if (isInvalid(v)) return v;
    var f = Math.pow(10, digits || 0);
    return Math.round(v * f) / f;
  }
  function roundMult(v, mult) {
    if (isInvalid(v)) return v;
    var dir = "", n = mult;
    if (typeof mult === "string") { dir = mult.slice(-1); n = parseFloat(mult); }
    var q = v / n;
    q = dir === "u" ? Math.ceil(q) : dir === "d" ? Math.floor(q) : Math.round(q);
    return q * n;
  }
  function fmtNum(v, digits) {
    if (isInvalid(v)) return "—";
    var s = (digits != null ? Number(v).toFixed(digits) : String(v));
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }
  function interp(x, x1, y1, x2, y2) { return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1); }

  // ISA + density/pressure altitude (exact, matches the prior physics module)
  var LAPSE = 0.00198; // degC per ft
  function stdTemp(pa) { return 15 - LAPSE * pa; }
  function stdTempDiff(pa, oat) { return oat - stdTemp(pa); }
  function pressureAlt(elev, altimeterInHg) { return elev + (29.92 - altimeterInHg) * 1000; }
  function densityAlt(pa, oat) { return pa + 120 * (oat - stdTemp(pa)); }
  // wind components (deg between wind and runway); headwind +, tailwind -
  function headwind(angleDeg, speed) { return speed * Math.cos(angleDeg * Math.PI / 180); }
  function crosswind(angleDeg, speed) { return speed * Math.sin(angleDeg * Math.PI / 180); }
  function angleBetween(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  var util = { round: round, roundMult: roundMult, fmtNum: fmtNum, interp: interp,
    stdTemp: stdTemp, stdTempDiff: stdTempDiff, pressureAlt: pressureAlt,
    densityAlt: densityAlt, headwind: headwind, crosswind: crosswind,
    angleBetween: angleBetween, isInvalid: isInvalid };

  /* ===========================================================================
   * Store — local persistence (localStorage; in-memory fallback for restricted
   * file:// contexts). NO cloud / network — device-only.
   * ==========================================================================*/
  var mem = {};
  function lsAvail() { try { var k = "__t"; root.localStorage.setItem(k, "1"); root.localStorage.removeItem(k); return true; } catch (e) { return false; } }
  var hasLS = (typeof root.localStorage !== "undefined") && lsAvail();
  var Store = {
    get: function (k) { try { return hasLS ? root.localStorage.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return mem[k] != null ? mem[k] : null; } },
    set: function (k, v) { try { if (hasLS) root.localStorage.setItem(k, v); else mem[k] = v; } catch (e) { mem[k] = v; } },
    del: function (k) { try { if (hasLS) root.localStorage.removeItem(k); else delete mem[k]; } catch (e) { delete mem[k]; } },
    getJSON: function (k, dflt) { var s = Store.get(k); if (s == null) return dflt; try { return JSON.parse(s); } catch (e) { return dflt; } },
    setJSON: function (k, o) { Store.set(k, JSON.stringify(o)); }
  };

  /* ===========================================================================
   * IO — state variables (the Model layer)
   * ==========================================================================*/
  var registry = {};   // id -> IOelt

  function IOelt(id, info) {
    var parts = id.split(".");
    this.id = id;
    this.page = parts[0];
    this.name = parts[1];
    this.unit = parts[2] || null;
    this.info = info || {};
    this.io = this.info.io || "internal";
    this.type = this.info.type || "number";
    this.message = "";
    this.style = null;
    this._options = this.info.options ? this.info.options.slice() : null;
    this.setDflt();
  }
  IOelt.prototype.dfltValue = function () {
    return this.info.dflt !== undefined ? this.info.dflt
      : (this.io === "output" || this.type === "number" ? root.INVALID_NULL
        : (this.type === "checkbox" || this.type === "boolean" ? false : ""));
  };
  IOelt.prototype.setDflt = function () { this.value = this.dfltValue(); this.message = ""; return this; };
  IOelt.prototype.isValid = function () { return !isInvalid(this.value); };
  IOelt.prototype.options = function (opts, value) {
    if (arguments.length === 0) return this._options;
    this._options = opts; if (value !== undefined) this.value = value; return this;
  };
  IOelt.prototype.msg = function (m, style) {
    if (arguments.length === 0) return this.message;
    this.message = m || ""; if (style) this.style = style; return this;
  };
  IOelt.prototype.validateInput = function (raw) {
    var info = this.info;
    if (this.type === "number") {
      if (raw === "" || raw == null) return { value: root.INVALID_NULL, msg: "" };
      var n = Number(raw);
      if (isNaN(n)) return { value: root.INVALID, msg: (info.desc || "Value") + " is not a number" };
      if (info.min != null && n < info.min) return { value: root.INVALID, msg: (info.desc || "Value") + " below minimum (" + info.min + ")" };
      if (info.max != null && n > info.max) return { value: root.INVALID, msg: (info.desc || "Value") + " above maximum (" + info.max + ")" };
      return { value: n, msg: "" };
    }
    if (this.type === "checkbox" || this.type === "boolean") return { value: !!raw, msg: "" };
    return { value: raw, msg: "" };
  };
  // get/set internal value. For outputs, invalid values route through invalidFn.
  IOelt.prototype.val = function (value, style) {
    if (arguments.length === 0) return this.value;
    if (this.io === "output" && isInvalid(value)) {
      var mapped = null;
      if (this.info.invalidFn) mapped = this.info.invalidFn(this.id, value);
      else if (root.Ptable && (value === root.INVALID || value instanceof root.PtableError)) {
        // bare NaN -> show as input-driven null by default
      }
      if (mapped) { this.value = mapped.value; if (mapped.msg) this.message = mapped.msg; }
      else { this.value = (value !== value ? root.INVALID_NULL : value); }
    } else {
      this.value = value;
    }
    if (style) this.style = style;
    return this.value;
  };
  // set from a user-typed string, validating per stateInfo
  IOelt.prototype.setInput = function (raw) {
    var r = this.validateInput(raw);
    this.value = r.value; this.message = r.msg; return this;
  };

  function register(id, info) { registry[id] = new IOelt(id, info); }

  // io(selector...) — string id -> elt; otherwise array of elts (subset of README)
  function io() {
    if (arguments.length === 1 && typeof arguments[0] === "string") return registry[arguments[0]];
    return IO.elts.apply(null, arguments);
  }
  var IO = {
    isElt: function (id) { return !!registry[id]; },
    elt: function (id) { return registry[id]; },
    elts: function () {
      var out = [], seen = {};
      function match(arg) {
        Object.keys(registry).forEach(function (id) {
          var e = registry[id], ok = false;
          if (arg instanceof RegExp) ok = arg.test(id);
          else if (typeof arg === "string") ok = id === arg;
          else if (Array.isArray(arg)) { arg.forEach(match); return; }
          else if (arg && typeof arg === "object") {
            ok = true;
            if (arg.page && e.page !== arg.page) ok = false;
            if (arg.io && e.io !== arg.io) ok = false;
            if (arg.includePat && !new RegExp(arg.includePat).test(id)) ok = false;
            if (arg.excludePat && new RegExp(arg.excludePat).test(id)) ok = false;
          }
          if (ok && !seen[id]) { seen[id] = 1; out.push(e); }
        });
      }
      Array.prototype.slice.call(arguments).forEach(match);
      return out;
    },
    ids: function () { return IO.elts.apply(null, arguments).map(function (e) { return e.id; }); },
    isValid: function () {
      return Array.prototype.slice.call(arguments).every(function (a) {
        if (Array.isArray(a)) return IO.isValid.apply(null, a);
        if (typeof a === "boolean") return true;
        if (typeof a === "string" && registry[a]) return registry[a].isValid();
        if (a instanceof IOelt) return a.isValid();
        return !isInvalid(a);
      });
    },
    register: register
  };

  /* ===========================================================================
   * Ptable — POH performance table with recursive interpolation (README spec)
   * ==========================================================================*/
  function PtableError(msg, parmName) { this.msg = msg; this.parmName = parmName; }
  PtableError.prototype.valueOf = function () { return NaN; };
  var lastError = null;

  function Ptable(obj) {
    this.title = obj.title; this.parmNames = obj.parmNames;
    this.parmLimits = obj.parmLimits || []; this.rndMult = obj.rndMult; this.a = obj.a;
  }
  Ptable.prototype._interp1 = function (rows, x, depth, getV) {
    var i, lim = this.parmLimits[depth] || "";
    var lo = rows[0], hi = rows[rows.length - 1];
    if (typeof x === "string") {
      for (i = 0; i < rows.length; i++) if (rows[i].p === x) return getV(rows[i]);
      lastError = new PtableError("invalid", this.parmNames[depth]); return lastError;
    }
    if (x < lo.p) {
      if (lim === "L" || lim === "B") x = lo.p;
      else { lastError = new PtableError("too low", this.parmNames[depth]); return lastError; }
    }
    if (x > hi.p) {
      if (lim === "H" || lim === "B") x = hi.p;
      else { lastError = new PtableError("too high", this.parmNames[depth]); return lastError; }
    }
    for (i = 0; i < rows.length - 1; i++) {
      if (x >= rows[i].p && x <= rows[i + 1].p) {
        var ya = getV(rows[i]), yb = getV(rows[i + 1]);
        if (isInvalid(ya)) return ya; if (isInvalid(yb)) return yb;
        if (rows[i + 1].p === rows[i].p) return ya;
        return interp(x, rows[i].p, ya, rows[i + 1].p, yb);
      }
    }
    return getV(rows[rows.length - 1]);
  };
  Ptable.prototype.interpolate = function () {
    lastError = null;
    var args = Array.prototype.slice.call(arguments);
    var rnd = this.rndMult;
    if (args.length > this.parmNames.length) rnd = args.pop();
    var self = this;
    function recurse(rows, depth) {
      return self._interp1(rows, args[depth], depth, function (row) {
        return row.a ? recurse(row.a, depth + 1) : row.v;
      });
    }
    var r = recurse(this.a, 0);
    if (isInvalid(r)) return r;
    return rnd != null ? roundMult(r, rnd) : r;
  };
  Ptable.error = function () { return lastError; };
  Ptable.clearError = function () { lastError = null; };
  // map an invalid value / PtableError to {value,msg} for an output's invalidFn
  Ptable.POHerror = function (value, errorMap) {
    var err = (value instanceof PtableError) ? value : lastError;
    if (!err) return { value: (value !== value ? root.INVALID_INPUT : root.INVALID_NULL), msg: "" };
    var name = (errorMap && errorMap[err.parmName]) || err.parmName || "Input";
    var dir = err.msg === "too high" ? " > POH maximum"
            : err.msg === "too low" ? " < POH minimum" : " invalid";
    return { value: err.msg === "invalid" ? root.INVALID_INPUT : root.INVALID_POH, msg: name + dir };
  };

  /* ===========================================================================
   * CGpoint / CGenvelope
   * ==========================================================================*/
  function CGpoint(weight, arm) {
    if (weight instanceof CGpoint) { this.weight = weight.weight; this.arm = weight.arm; }
    else { this.weight = weight; this.arm = arm; }
  }
  CGpoint.prototype.add = function (weight, arm) {
    if (!weight) return this;
    var m = this.weight * this.arm + weight * arm;
    this.weight += weight; this.arm = this.weight ? m / this.weight : arm; return this;
  };
  // Pragmatic CGenvelope: forward limit piecewise by weight, aft limit piecewise.
  function CGenvelope(obj) {
    this.title = obj.title; this.fwd = obj.fwd; this.aft = obj.aft; this.minWeight = obj.minWeight;
  }
  function limitAt(points, weight) {
    var s = points;
    if (weight <= s[0].weight) return s[0].arm;
    if (weight >= s[s.length - 1].weight) return s[s.length - 1].arm;
    for (var i = 0; i < s.length - 1; i++)
      if (weight >= s[i].weight && weight <= s[i + 1].weight)
        return interp(weight, s[i].weight, s[i].arm, s[i + 1].weight, s[i + 1].arm);
    return s[0].arm;
  }
  CGenvelope.prototype.limits = function (weight) {
    return { fwd: limitAt(this.fwd, weight), aft: limitAt(this.aft, weight) };
  };
  CGenvelope.prototype.inEnvelope = function (cg) {
    var L = this.limits(cg.weight);
    return cg.arm >= L.fwd - 1e-9 && cg.arm <= L.aft + 1e-9;
  };
  CGenvelope.prototype.points = function () { // polygon for drawing
    var pts = [], i;
    for (i = 0; i < this.fwd.length; i++) pts.push({ weight: this.fwd[i].weight, arm: this.fwd[i].arm });
    for (i = this.aft.length - 1; i >= 0; i--) pts.push({ weight: this.aft[i].weight, arm: this.aft[i].arm });
    return pts;
  };

  /* ===========================================================================
   * ac — aircraft model registry
   * ==========================================================================*/
  var models = {}, currentId = null;
  var ac = {
    addModel: function (data) { models[data.model] = data; if (!currentId) currentId = data.model; },
    currentModel: function (m) { if (m === undefined) return currentId; currentId = m; return m; },
    data: function (attr, model) { var d = models[model || currentId]; return d ? d[attr] : undefined; },
    hasAttribute: function (attr) { var d = models[currentId]; return d && attr in d; },
    isModel: function (re) { return new RegExp(re).test(currentId); },
    models: function () { return Object.keys(models); }
  };

  /* ===========================================================================
   * ctl — controller: page registry, init, recompute, navigation
   * ==========================================================================*/
  var pages = {}, pageOrder = [], currentPage = null;
  var ctl = {
    newPage: function (id) { var p = { pageId: id }; pages[id] = p; pageOrder.push(id); return p; },
    page: function (id) { return pages[id]; },
    pageOrder: function () { return pageOrder.slice(); },
    current: function (id) { if (id === undefined) return currentPage; currentPage = id; return id; },
    init: function () {
      pageOrder.forEach(function (id) {
        var p = pages[id];
        if (p.stateInfo) { var si = p.stateInfo(); Object.keys(si).forEach(function (sid) { register(sid, si[sid]); }); }
      });
      pageOrder.forEach(function (id) { if (pages[id].init) pages[id].init(); });
      ctl.restore();
    },
    // persist user inputs (device-only); profiles handled separately by the page.
    persist: function () {
      var o = {};
      IO.elts({ io: "input" }).forEach(function (e) { if (e.info.save !== "none") o[e.id] = e.val(); });
      Store.setJSON("pa44.inputs", o);
    },
    restore: function () {
      var o = Store.getJSON("pa44.inputs", null); if (!o) return;
      Object.keys(o).forEach(function (id) { if (registry[id] && registry[id].io === "input") registry[id].value = o[id]; });
    },
    // Reset outputs, run every page's compute fns (twice, to propagate cross-page).
    change: function () {
      function pass() {
        pageOrder.forEach(function (id) {
          var p = pages[id];
          if (!p.computeInfo) return;
          p.computeInfo().forEach(function (ci) {
            if (ci.outputs) IO.elts.apply(null, ci.outputs).forEach(function (e) {
              if (e.io === "output") e.setDflt();
            });
            Ptable.clearError();
            if (ci.fn) ci.fn();
          });
        });
      }
      pass(); pass();
      try { ctl.persist(); } catch (e) {}
    },
    selectPage: function (id) { currentPage = id; ctl.change(); view.render(); }
  };

  /* ===========================================================================
   * view — JSON template -> HTML, with input binding (simplified renderer:
   * the active page is re-rendered on each change; documented fine-grained
   * sync is collapsed into a full re-render, adequate for this app's size).
   * ==========================================================================*/
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function domId(sid) { return "f_" + sid.replace(/\./g, "_"); }

  function showOK(t) { // evaluate show/hide global keys
    function truthy(spec) {
      if (typeof spec === "function") return !!spec();
      if (typeof spec === "string") { var e = registry[spec]; return e ? !!e.val() && e.isValid() : false; }
      if (spec && typeof spec === "object") { var k = Object.keys(spec)[0]; var el = registry[k]; return el && el.val() === spec[k]; }
      return true;
    }
    if (t && typeof t === "object") {
      if ("show" in t && !truthy(t.show)) return false;
      if ("hide" in t && truthy(t.hide)) return false;
    }
    return true;
  }

  function fmtOutput(e) {
    var v = e.val();
    if (v === root.INVALID_POH) return "POH";
    if (v === root.INVALID_INPUT) return "check input";
    if (isInvalid(v)) return "—";
    if (e.type === "number") {
      var digits = 0, m = (e.info.fmt || "").match(/\.(\d+)/); if (m) digits = +m[1];
      return fmtNum(v, digits);
    }
    return String(v);
  }
  function unitAbbrev(e) { return e.unit ? e.unit : ""; }

  // render a {{ref}} -> input or output html; collect bindings into `binds`
  function renderRef(sid, valueOnly, addUnit, binds) {
    var withUnit = false;
    if (/@$/.test(sid)) { addUnit = true; sid = sid.slice(0, -1); }
    var e = registry[sid];
    if (!e) return "<span class='missing'>{{" + esc(sid) + "}}</span>";
    var unit = addUnit && e.unit ? " " + e.unit : "";
    if (e.io === "input" && !valueOnly) {
      var id = domId(sid);
      binds.push(sid);
      if (e.type === "checkbox" || e.type === "boolean")
        return "<input class='f-in' type='checkbox' id='" + id + "' data-sid='" + sid + "'" + (e.val() ? " checked" : "") + ">";
      if (e.type === "radio") {
        return (e.options() || []).map(function (o, i) {
          var rid = id + "_" + i;
          return "<label class='f-radio'><input type='radio' name='" + id + "' id='" + rid + "' data-sid='" + sid + "' data-val='" + esc(o.value) + "'" +
            (String(e.val()) === String(o.value) ? " checked" : "") + "> " + esc(o.text != null ? o.text : o.value) + "</label>";
        }).join("");
      }
      if (e.type === "option") {
        var opts = (e.options() || []).map(function (o) {
          return "<option value='" + esc(o.value) + "'" + (String(e.val()) === String(o.value) ? " selected" : "") + ">" + esc(o.text != null ? o.text : o.value) + "</option>";
        }).join("");
        return "<select class='f-in' id='" + id + "' data-sid='" + sid + "'>" + opts + "</select>";
      }
      var val = isInvalid(e.val()) ? "" : e.val();
      if (e.type === "number") {
        var step = e.info.step != null ? e.info.step : 1;
        var mn = e.info.min != null ? " min='" + e.info.min + "'" : "";
        var mx = e.info.max != null ? " max='" + e.info.max + "'" : "";
        return "<input class='f-in f-num' type='number' inputmode='decimal' step='" + step + "'" + mn + mx +
          " id='" + id + "' data-sid='" + sid + "' value='" + esc(val) + "'>" + unit;
      }
      return "<input class='f-in' id='" + id + "' data-sid='" + sid + "' value='" + esc(val) + "'>" + unit;
    }
    // output / value-only
    if (e.type === "html") return "<span class='f-out'>" + (isInvalid(e.val()) ? "—" : e.val()) + "</span>";
    var style = e.style ? " style='color:" + (e.style.color || "") + "'" : "";
    return "<span class='f-out'" + style + ">" + esc(fmtOutput(e)) + unit + "</span>" +
      (e.message ? "<span class='f-msg'>" + esc(e.message) + "</span>" : "");
  }

  function processString(s, binds) {
    return String(s).replace(/\{\{\|?([^}|]+)\|?\}\}/g, function (m, inner) {
      var valueOnly = /^\{\{\|/.test(m);
      return renderRef(inner.trim(), valueOnly, false, binds);
    });
  }

  function renderTemplate(t, binds) {
    if (t == null) return "";
    if (typeof t === "string") return processString(t, binds);
    if (Array.isArray(t)) return t.map(function (x) { return renderTemplate(x, binds); }).join("");
    if (!showOK(t)) return "";
    switch (t.tag) {
      case "page":
        return "<header class='f-phead'><h1>" + esc(t.title) + "</h1>" +
          (t.sub ? "<p>" + esc(t.sub) + "</p>" : "") + "</header>" + renderTemplate(t.content, binds);
      case "group":
        var title = Array.isArray(t.title) ? t.title.map(function (x) { return renderTemplate(x, binds); }).join(" · ") : esc(t.title || "");
        return "<section class='f-group " + (t.className || "") + "'>" +
          (t.title ? "<h3>" + title + "</h3>" : "") + renderTemplate(t.content, binds) + "</section>";
      case "row":
        var label = t.label != null ? "<div class='f-rl'>" + renderTemplate(t.label, binds) + "</div>" : "";
        return "<div class='f-row" + (t.label == null ? " full" : "") + " " + (t.className || "") + "'>" +
          label + "<div class='f-rc'>" + renderTemplate(t.content, binds) + "</div></div>";
      case "cols":
        return "<div class='f-cols'>" +
          "<div class='f-col f-colL'>" + renderTemplate(t.left, binds) + "</div>" +
          "<div class='f-col f-colR'>" + renderTemplate(t.right, binds) + "</div></div>";
      case "grid":
        return "<div class='f-grid'>" + renderTemplate(t.content, binds) + "</div>";
      case "button":
        return "<button class='f-btn' onclick=\"" + (t.onClick || "") + "\">" + esc(t.title) + "</button>";
      case "note":
        return "<div class='f-note'>" + renderTemplate(t.content, binds) + "</div>";
      case "dash":
        return "<div class='f-dash'>" + (t.head ? renderTemplate(t.head, binds) : "") +
          "<div class='f-grid'>" + (t.panels || []).map(function (p) { return renderTemplate(p, binds); }).join("") + "</div></div>";
      case "panel":
        return "<section class='f-panel " + (t.className || "") + "'" +
          (t.onClick ? " onclick=\"" + t.onClick + "\" role='button' tabindex='0'" : "") + ">" +
          "<div class='f-ptitle'>" + esc(t.title || "") + (t.titleRight ? "<span class='f-pright'>" + renderTemplate(t.titleRight, binds) + "</span>" : "") + "</div>" +
          "<div class='f-pbody'>" + renderTemplate(t.content, binds) + "</div>" +
          (t.foot ? "<div class='f-pfoot'>" + esc(t.foot) + " ›</div>" : "") + "</section>";
      case "html":
      case "text":
      case "string":
        return processString(t.content, binds);
      default:
        return t.content ? renderTemplate(t.content, binds) : "";
    }
  }

  var view = {
    mount: null,
    render: function () {
      if (!currentPage || !pages[currentPage] || !view.mount) return;
      var binds = [];
      var html = renderTemplate(pages[currentPage].viewTemplate(), binds);
      view.mount.innerHTML = html;
      // bind inputs
      Array.prototype.forEach.call(view.mount.querySelectorAll("[data-sid]"), function (el) {
        var sid = el.getAttribute("data-sid");
        var e = registry[sid];
        var handler = function () {
          if (e.type === "radio") { if (el.checked) e.setInput(el.getAttribute("data-val")); }
          else if (e.type === "checkbox" || e.type === "boolean") e.setInput(el.checked);
          else e.setInput(el.value);
          var active = el.id;
          ctl.change(); view.render();
          var again = view.mount.querySelector("#" + active);
          if (again && again.focus) { again.focus(); if (again.setSelectionRange && again.value) { try { again.setSelectionRange(again.value.length, again.value.length); } catch (x) {} } }
        };
        el.addEventListener("change", handler);
      });
    }
  };

  /* ---- Store: offline persistence (localStorage, guarded; no cloud) ---- */
  var _mem = {};
  root.Store = {
    get: function (k) { try { var v = root.localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return (k in _mem) ? _mem[k] : null; } },
    set: function (k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { _mem[k] = v; } },
    del: function (k) { try { root.localStorage.removeItem(k); } catch (e) { delete _mem[k]; } },
    // convenience aliases (get/set already JSON-encode); dflt for missing keys
    getJSON: function (k, dflt) { var v = this.get(k); return v == null ? dflt : v; },
    setJSON: function (k, o) { this.set(k, o); }
  };

  /* ---- exports --------------------------------------------------------- */
  root.io = io; root.IO = IO; root.ctl = ctl; root.ac = ac; root.view = view;
  root.Ptable = Ptable; root.PtableError = PtableError;
  root.CGpoint = CGpoint; root.CGenvelope = CGenvelope;
  root.ppUtil = util;
})(typeof window !== "undefined" ? window : globalThis);
