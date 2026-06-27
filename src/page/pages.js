/* =============================================================================
 * PA-44-180 SEMINOLE — pages (View + Controller per page).
 * Layout reworked to mirror the reference screenshots: a "Flight Performance"
 * dashboard home + per-page split Settings | Results, blue result values, red
 * warnings, and dynamic runway/wind graphics. PA-44-180 POH data only.
 * ===========================================================================*/
(function (root) {
  "use strict";
  var io = root.io, IO = root.IO, ctl = root.ctl, ac = root.ac, U = root.ppUtil,
      Ptable = root.Ptable, CGpoint = root.CGpoint, Store = root.Store;
  var pp = {}; root.pp = pp;

  /* ===========================================================================
   * Shared helpers
   * ==========================================================================*/
  pp.distErr = function (mapExtra) { return function (id, value) {
    return Ptable.POHerror(value, Object.assign({ "density altitude": "Density altitude", weight: "Weight", wind: "Wind component" }, mapExtra || {}));
  }; };
  pp.copyOnChange = function (srcId, dstId, xform) {
    var last;
    return function () { var s = io(srcId); if (!s) return; var v = s.val();
      if (v !== last) { last = v; if (IO.isValid(v)) io(dstId).val(xform ? xform(v) : v); } };
  };
  pp.atmo = function (p) { var elev = io(p + ".elev.ft").val(), alt = io(p + ".altimeter.inhg").val(), oat = io(p + ".oat.dC").val();
    var pa = U.pressureAlt(elev, alt); return { pa: pa, oat: oat, da: U.densityAlt(pa, oat), isa: U.stdTempDiff(pa, oat) }; };
  pp.rwyHeading = function (rwy) { var n = parseInt(rwy, 10); if (!n) n = 36; return n * 10; };
  pp.windComp = function (hdg, wdir, wkt) {
    if (!IO.isValid(hdg, wdir, wkt)) return { head: 0, cross: 0, side: "", delta: 0 };
    var delta = ((wdir - hdg) % 360 + 360) % 360, r = delta * Math.PI / 180;
    var head = wkt * Math.cos(r), cross = wkt * Math.sin(r);
    return { head: head, cross: Math.abs(cross), side: cross > 0.05 ? "right" : cross < -0.05 ? "left" : "", delta: delta };
  };
  pp.vAdjust = function (vMax, w) { return Math.round(vMax * Math.sqrt(w / ac.data("maxTOweight"))); };
  pp.va = function (w) { var s = ac.data("speeds"); return Math.round(U.interp(Math.max(2700, Math.min(3800, w)), 2700, s.Va2700, 3800, s.Va3800)); };

  // dynamic runway + wind graphic (reflects runway heading, wind dir & speed)
  pp.runwaySVG = function (hdg, wdir, wkt) {
    var W = 150, H = 184, cx = 75, cy = 88;
    hdg = ((hdg % 360) + 360) % 360;
    var num = Math.round(hdg / 10); if (num === 0) num = 36; num = (num < 10 ? "0" : "") + num;
    var s = "<rect x='" + (cx - 17) + "' y='" + (cy - 64) + "' width='34' height='128' rx='3' fill='#565b62'/>";
    s += "<line x1='" + cx + "' y1='" + (cy - 56) + "' x2='" + cx + "' y2='" + (cy + 56) + "' stroke='#eef2f6' stroke-width='2' stroke-dasharray='9 8'/>";
    s += "<text x='" + cx + "' y='" + (cy + 60) + "' text-anchor='middle' fill='#fff' font-size='13' font-weight='700'>" + num + "</text>";
    if (IO.isValid(wdir, wkt) && wkt > 0) {
      var delta = ((wdir - hdg) % 360 + 360) % 360, r = delta * Math.PI / 180, R = 68, r2 = 26;
      var tx = cx + R * Math.sin(r), ty = cy - R * Math.cos(r);
      var hx = cx + r2 * Math.sin(r), hy = cy - r2 * Math.cos(r);
      var head = wkt * Math.cos(r), col = head >= -0.05 ? "#3fd896" : "#ff6a6a";
      s += "<line x1='" + tx.toFixed(1) + "' y1='" + ty.toFixed(1) + "' x2='" + hx.toFixed(1) + "' y2='" + hy.toFixed(1) + "' stroke='" + col + "' stroke-width='3'/>";
      function bp(off) { var a = r + off; return (hx + 12 * Math.sin(a)).toFixed(1) + "," + (hy - 12 * Math.cos(a)).toFixed(1); }
      s += "<polygon points='" + hx.toFixed(1) + "," + hy.toFixed(1) + " " + bp(0.4) + " " + bp(-0.4) + "' fill='" + col + "'/>";
      s += "<text x='" + tx.toFixed(1) + "' y='" + (ty < cy ? ty - 6 : ty + 12).toFixed(1) + "' text-anchor='middle' font-size='10' fill='" + col + "'>" + (wdir < 100 ? (wdir < 10 ? "00" : "0") : "") + wdir + "°/" + wkt + "</text>";
    } else { s += "<text x='" + cx + "' y='14' text-anchor='middle' font-size='10' fill='#7f8b99'>calm</text>"; }
    return "<svg viewBox='0 0 " + W + " " + H + "' class='f-rwy' role='img' aria-label='runway " + num + " with wind'>" + s + "</svg>";
  };

  function condState(p, withWind) {
    var s = {};
    s[p + ".airport"] = { io: "input", type: "text", dflt: "", desc: "Airport (optional, no lookup)" };
    s[p + ".elev.ft"] = { io: "input", type: "number", min: -1500, max: 14000, dflt: 0, desc: "Field elevation" };
    s[p + ".oat.dC"] = { io: "input", type: "number", min: -40, max: 50, dflt: 15, desc: "OAT" };
    s[p + ".altimeter.inhg"] = { io: "input", type: "number", min: 28, max: 31, dflt: 29.92, desc: "Altimeter" };
    s[p + ".weight.lbs"] = { io: "input", type: "number", min: 2400, max: 3800, dflt: 3800, desc: "Weight" };
    s[p + ".runway"] = { io: "input", type: "option", dflt: "01", options: rwyOptions() };
    s[p + ".rwyLen.ft"] = { io: "input", type: "number", min: 0, max: 17000, dflt: 0, desc: "Runway length" };
    s[p + ".slope"] = { io: "input", type: "number", min: -5, max: 5, dflt: 0, desc: "Runway slope" };
    s[p + ".surface"] = { io: "input", type: "option", dflt: "hard", options: [{ value: "hard", text: "Hard" }, { value: "turf", text: "Turf" }, { value: "gravel", text: "Gravel" }] };
    s[p + ".condition"] = { io: "input", type: "option", dflt: "dry", options: [{ value: "dry", text: "Dry" }, { value: "wet", text: "Wet" }, { value: "snow", text: "Snow/ice" }] };
    s[p + ".adjPct"] = { io: "input", type: "number", min: 0, max: 100, dflt: 0, desc: "Ground roll adjustment %" };
    if (withWind) { s[p + ".windDir.deg"] = { io: "input", type: "number", min: 0, max: 360, dflt: 360, desc: "Wind direction" };
      s[p + ".windSpeed.kt"] = { io: "input", type: "number", min: 0, max: 60, dflt: 0, desc: "Wind speed" }; }
    return s;
  }
  function rwyOptions() { var a = [], i; for (i = 1; i <= 36; i++) a.push({ value: (i < 10 ? "0" : "") + i }); return a; }
  function condInputs(p, isDep) {
    return [
      { tag: "row", label: "Airport (optional)", content: "{{" + p + ".airport}}" },
      { tag: "row", label: "Altitude (ft)", content: "{{" + p + ".elev.ft}}" },
      { tag: "row", label: "Wind from / speed", content: "{{" + p + ".windDir.deg}} ° @ {{" + p + ".windSpeed.kt}} kt" },
      { tag: "row", label: "OAT (°C)", content: "{{" + p + ".oat.dC}} {{" + p + ".tempInfo}}" },
      { tag: "row", label: "Altimeter (inHg)", content: "{{" + p + ".altimeter.inhg}}" },
      { tag: "row", label: "Runway", content: "{{" + p + ".runway}}" },
      { tag: "row", label: (isDep ? "Runway TORA (ft)" : "Runway LDA (ft)"), content: "{{" + p + ".rwyLen.ft}}" },
      { tag: "row", label: "Runway slope (%)", content: "{{" + p + ".slope}}" },
      { tag: "row", label: "Runway surface", content: "{{" + p + ".surface}}" },
      { tag: "row", label: "Runway condition", content: "{{" + p + ".condition}}" },
      { tag: "row", label: "Runway heading", content: "{{" + p + ".rwyHeadingTxt}}" },
      { tag: "row", label: "Ground roll adj (%)", content: "{{" + p + ".adjPct}}" }
    ];
  }

  /* ===========================================================================
   * AIRCRAFT page + profile manager (local only)
   * ==========================================================================*/
  var PKEY = "pa44.profiles", LKEY = "pa44.lastProfile";
  pp.profiles = function () { var l = Store.get(PKEY); return Array.isArray(l) ? l : []; };
  pp.profileList = function () {
    var list = pp.profiles().map(function (p) { return { value: p.reg, text: p.reg }; });
    list.unshift({ value: "", text: "— Default (unsaved) —" });
    return list;
  };
  pp.loadProfile = function (reg) {
    var p = pp.profiles().filter(function (x) { return x.reg === reg; })[0];
    if (p) { io("ac.emptyWeight.lbs").val(p.bew); io("ac.emptyArm.in").val(p.arm); io("ac.reg").val(p.reg); Store.set(LKEY, reg); }
    else { Store.set(LKEY, ""); }   // "— Default (unsaved) —": keep whatever reg the user typed
    io("ac.selected").val(p ? reg : "");
  };
  pp.profileSave = function () {
    var reg = (io("ac.reg").val() || "").trim().toUpperCase();
    var bew = io("ac.emptyWeight.lbs").val(), arm = io("ac.emptyArm.in").val();
    if (!reg) { root.alert && root.alert("Enter a registration first."); return; }
    if (!IO.isValid(bew, arm)) { root.alert && root.alert("Enter a valid empty weight and arm."); return; }
    var list = pp.profiles().filter(function (x) { return x.reg !== reg; });
    list.push({ reg: reg, bew: bew, arm: arm }); list.sort(function (a, b) { return a.reg < b.reg ? -1 : 1; });
    Store.set(PKEY, list); Store.set(LKEY, reg);
    io("ac.selected").options(pp.profileList(), reg); io("ac.selected").val(reg);
    ctl.change(); root.view.render();
  };
  pp.profileDelete = function () {
    var reg = io("ac.selected").val(); if (!reg) { root.alert && root.alert("Select a saved profile to delete."); return; }
    if (root.confirm && !root.confirm("Delete profile " + reg + "?")) return;
    var list = pp.profiles().filter(function (x) { return x.reg !== reg; });
    Store.set(PKEY, list); Store.set(LKEY, "");
    io("ac.selected").options(pp.profileList(), "");
    io("ac.reg").val(""); io("ac.selected").val(""); pp._lastSel = "";
    ctl.change(); root.view.render();
  };
  pp.profileNew = function () { io("ac.selected").val(""); io("ac.reg").val(""); io("ac.emptyWeight.lbs").setDflt(); io("ac.emptyArm.in").setDflt(); Store.set(LKEY, ""); pp._lastSel = ""; ctl.change(); root.view.render(); };

  pp.acPage = ctl.newPage("aircraft");
  pp.acPage.stateInfo = function () { return {
    "ac.selected": { io: "input", type: "option", dflt: "", options: pp.profileList(), onChange: true },
    "ac.reg": { io: "input", type: "text", dflt: "", desc: "Registration" },
    "ac.emptyWeight.lbs": { io: "input", type: "number", min: 1500, max: 3800, dflt: ac.data("dfltEmptyWeight"), desc: "Empty weight" },
    "ac.emptyArm.in": { io: "input", type: "number", min: 80, max: 95, dflt: ac.data("dfltEmptyArm"), desc: "Empty arm" },
    "ac.note": { io: "output", type: "html" }
  }; };
  pp.acPage.init = function () {
    io("ac.selected").options(pp.profileList());
    var last = Store.get(LKEY);
    if (last) { pp.loadProfile(last); pp._lastSel = io("ac.selected").val(); }
  };
  pp.acPage.viewTemplate = function () { return { tag: "page", title: "Aircraft", sub: ac.data("model") + " · " + ac.data("document"), content: [
    { tag: "cols",
      left: { tag: "group", className: "iGroup", title: "Aircraft profile", content: [
        { tag: "row", label: "Saved profile", content: "{{ac.selected}}" },
        { tag: "row", label: "Registration", content: "{{ac.reg}}" },
        { tag: "row", label: "Basic empty weight (lb)", content: "{{ac.emptyWeight.lbs}}" },
        { tag: "row", label: "Empty weight arm (in)", content: "{{ac.emptyArm.in}}" },
        { tag: "row", full: true, content: [
          { tag: "button", title: "New", onClick: "pp.profileNew()" },
          { tag: "button", title: "Save", onClick: "pp.profileSave()" },
          { tag: "button", title: "Delete", onClick: "pp.profileDelete()" }
        ] }
      ] },
      right: { tag: "group", className: "oGroup", title: "Notes & limits", content: [
        { tag: "row", content: "{{ac.note}}" },
        { tag: "row", label: "Engines", content: "Counter-rotating O-360-A1H6 / LO-360-A1H6 — no critical engine" },
        { tag: "row", label: "Max ramp / TO / landing", content: U.fmtNum(ac.data("maxRampWeight")) + " / " + U.fmtNum(ac.data("maxTOweight")) + " / " + U.fmtNum(ac.data("maxLdgWeight")) + " lb" },
        { tag: "row", label: "Fuel", content: ac.data("fuelUsableGal") + " gal usable · " + ac.data("fuelLbPerGal") + " lb/gal" },
        { tag: "row", label: "Datum", content: ac.data("datumNote") }
      ] }
    }
  ] }; };
  pp._lastSel = null;
  pp.acPage.computeInfo = function () { return [
    { inputs: ["ac.selected"], fn: function () { var v = io("ac.selected").val(); if (v !== pp._lastSel) { pp._lastSel = v; pp.loadProfile(v); } } },
    { inputs: ["ac.emptyWeight.lbs", "ac.emptyArm.in"], outputs: ["ac.note"], fn: function () {
      var saved = pp.profiles().length;
      io("ac.note").val("Empty weight &amp; arm feed Weight &amp; Balance live. <b>" + saved + "</b> profile" + (saved === 1 ? "" : "s") + " saved locally on this device (no cloud). " +
        (Store.get(LKEY) ? "Loaded: <b>" + Store.get(LKEY) + "</b>." : "Using <b>unsaved/default</b> values — replace with your airframe's W&amp;B record and Save."));
    } }
  ]; };
  // selection change handler (wired in boot via onChange dispatch)
  pp.onSelectProfile = function () { pp.loadProfile(io("ac.selected").val()); };

  /* ===========================================================================
   * WEIGHT & BALANCE
   * ==========================================================================*/
  pp.wbPage = ctl.newPage("wb");
  pp.wbPage.stateInfo = function () { return {
    "wb.fuel.gal": { io: "input", type: "number", min: 0, max: 108, dflt: 108, desc: "Fuel" },
    "wb.burn.gal": { io: "input", type: "number", min: 0, max: 108, dflt: 40, desc: "Fuel burn to landing" },
    "wb.taxi.gal": { io: "input", type: "number", min: 0, max: 10, dflt: 2.7, desc: "Taxi fuel" },
    "wb.front.lbs": { io: "input", type: "number", min: 0, max: 800, dflt: 340, desc: "Front seats" },
    "wb.rear.lbs": { io: "input", type: "number", min: 0, max: 800, dflt: 0, desc: "Rear seats" },
    "wb.baggage.lbs": { io: "input", type: "number", min: 0, max: 400, dflt: 0, desc: "Baggage" },
    "wb.ramp.lbs": { io: "output", type: "number", fmt: ".0" }, "wb.TOweight.lbs": { io: "output", type: "number", fmt: ".0" },
    "wb.TOCG.in": { io: "output", type: "number", fmt: ".1" }, "wb.ldgWeight.lbs": { io: "output", type: "number", fmt: ".0" },
    "wb.ldgCG.in": { io: "output", type: "number", fmt: ".1" }, "wb.zfWeight.lbs": { io: "output", type: "number", fmt: ".0" },
    "wb.zfCG.in": { io: "output", type: "number", fmt: ".1" }, "wb.maxFuel.gal": { io: "output", type: "number", fmt: ".0" },
    "wb.addPayload.lbs": { io: "output", type: "number", fmt: ".0" },
    "wb.TOstatus": { io: "output", type: "html" }, "wb.ldgStatus": { io: "output", type: "html" },
    "wb.status": { io: "output", type: "html" }, "wb.diagram": { io: "output", type: "html" }
  }; };
  pp.wbPage.viewTemplate = function () { var st = ac.data("CGstations"); return { tag: "page", title: "Weight & balance", sub: ac.headerSub(), content: [
    { tag: "cols",
      left: { tag: "group", className: "iGroup", title: "Settings", content: [
        { tag: "row", label: "Fuel (gal) ≤108", content: "{{wb.fuel.gal}}" },
        { tag: "row", label: "Fuel used to dest (gal)", content: "{{wb.burn.gal}}" },
        { tag: "row", label: "Taxi out fuel (gal)", content: "{{wb.taxi.gal}}" },
        { tag: "row", label: "Row 1 (lb) @ " + st.front.arm + '"', content: "{{wb.front.lbs}}" },
        { tag: "row", label: "Row 2 (lb) @ " + st.rear.arm + '"', content: "{{wb.rear.lbs}}" },
        { tag: "row", label: "Baggage (lb) ≤200 @ " + st.baggage.arm + '"', content: "{{wb.baggage.lbs}}" }
      ] },
      right: { tag: "group", className: "oGroup", title: "Results", content: [
        { tag: "row", content: "{{wb.diagram}}" },
        { tag: "row", content: "{{wb.status}}" },
        { tag: "row", label: "Takeoff weight", content: "{{wb.TOweight.lbs@}} lb {{wb.TOstatus}}" },
        { tag: "row", label: "Takeoff CG", content: "{{wb.TOCG.in@}} in" },
        { tag: "row", label: "Landing weight", content: "{{wb.ldgWeight.lbs@}} lb {{wb.ldgStatus}}" },
        { tag: "row", label: "Landing CG", content: "{{wb.ldgCG.in@}} in" },
        { tag: "row", label: "Zero-fuel weight / CG", content: "{{wb.zfWeight.lbs@}} lb · {{wb.zfCG.in@}} in" },
        { tag: "row", label: "Ramp weight", content: "{{wb.ramp.lbs@}} lb" },
        { tag: "row", label: "Max fuel load", content: "{{wb.maxFuel.gal@}} gal" },
        { tag: "row", label: "Additional payload", content: "{{wb.addPayload.lbs@}} lb" }
      ] }
    }
  ] }; };
  pp.wbPage.computeInfo = function () { return [{ inputs: [{ page: "wb", io: "input" }, "ac.emptyWeight.lbs", "ac.emptyArm.in"], outputs: [{ page: "wb", io: "output" }], fn: pp.wbCompute }]; };
  pp.wbCompute = function () {
    var st = ac.data("CGstations"), lb = ac.data("fuelLbPerGal"), env = ac.data("CGenvelope");
    var cg = new CGpoint(io("ac.emptyWeight.lbs").val(), io("ac.emptyArm.in").val());
    if (!IO.isValid(cg.weight, cg.arm)) { io("wb.status").val("<b class='bad'>Enter a valid empty weight &amp; arm on the Aircraft page.</b>"); return; }
    cg.add(io("wb.front.lbs").val(), st.front.arm); cg.add(io("wb.rear.lbs").val(), st.rear.arm); cg.add(io("wb.baggage.lbs").val(), st.baggage.arm);
    var zf = new CGpoint(cg);
    var ramp = new CGpoint(cg); ramp.add(io("wb.fuel.gal").val() * lb, st.fuel.arm);
    var to = new CGpoint(ramp); to.add(-io("wb.taxi.gal").val() * lb, st.fuel.arm);
    var ldg = new CGpoint(to); ldg.add(-io("wb.burn.gal").val() * lb, st.fuel.arm);
    io("wb.ramp.lbs").val(Math.round(ramp.weight));
    io("wb.TOweight.lbs").val(Math.round(to.weight)); io("wb.TOCG.in").val(U.round(to.arm, 1));
    io("wb.ldgWeight.lbs").val(Math.round(ldg.weight)); io("wb.ldgCG.in").val(U.round(ldg.arm, 1));
    io("wb.zfWeight.lbs").val(Math.round(zf.weight)); io("wb.zfCG.in").val(U.round(zf.arm, 1));
    var maxFuelByTO = (ac.data("maxTOweight") - (zf.weight - io("wb.taxi.gal").val() * lb)) / lb;
    io("wb.maxFuel.gal").val(Math.max(0, Math.min(ac.data("fuelUsableGal"), Math.round(maxFuelByTO))));
    io("wb.addPayload.lbs").val(Math.round(ac.data("maxTOweight") - to.weight));
    function badge(cgp, maxW) { var inenv = env.inEnvelope(cgp), over = cgp.weight > maxW;
      return (inenv && !over) ? "<b class='ok'>OK</b>" : "<b class='bad'>" + (over ? "OVER WT" : "CG") + "</b>"; }
    io("wb.TOstatus").val(badge(to, ac.data("maxTOweight")));
    io("wb.ldgStatus").val(badge(ldg, ac.data("maxLdgWeight")));
    var warn = [];
    if (ramp.weight > ac.data("maxRampWeight")) warn.push("ramp > " + ac.data("maxRampWeight"));
    if (to.weight > ac.data("maxTOweight")) warn.push("takeoff > " + ac.data("maxTOweight"));
    if (io("wb.baggage.lbs").val() > ac.data("maxBaggage")) warn.push("baggage > 200");
    if (!env.inEnvelope(to)) warn.push("takeoff CG out of envelope");
    if (!env.inEnvelope(ldg)) warn.push("landing CG out of envelope");
    io("wb.status").val(warn.length ? "<b class='bad'>⚠ " + warn.join("; ") + "</b>" : "<b class='ok'>Within all limits.</b>");
    io("wb.diagram").val(pp.envelopeSVG(env, to, ldg, io("wb.fuel.gal").val(), io("wb.fuel.gal").val() * lb, to.weight - (zf.weight)));
  };
  pp.envelopeSVG = function (env, to, ldg, fuelGal, fuelLb, payloadLb) {
    var W = 330, H = 200, pad = 34, barX = W - 70;
    var poly = env.points();
    var ws = poly.map(function (p) { return p.weight; }).concat([env.minWeight]);
    var as = poly.map(function (p) { return p.arm; });
    var wMin = Math.min.apply(null, ws), wMax = Math.max.apply(null, ws.concat([to.weight, ldg.weight]));
    var aMin = Math.min.apply(null, as) - 1, aMax = Math.max.apply(null, as) + 1;
    function x(a) { return pad + (a - aMin) / (aMax - aMin) * (barX - pad - 14); }
    function y(w) { return H - pad - (w - wMin) / (wMax - wMin) * (H - pad - 12); }
    var pts = poly.map(function (p) { return x(p.arm).toFixed(1) + "," + y(p.weight).toFixed(1); }).join(" ");
    function dot(cg, c, lab) { if (!IO.isValid(cg.weight, cg.arm)) return "";
      return "<circle cx='" + x(cg.arm).toFixed(1) + "' cy='" + y(cg.weight).toFixed(1) + "' r='4.5' fill='" + c + "'/>" +
        "<text x='" + (x(cg.arm) + 6).toFixed(1) + "' y='" + (y(cg.weight) + 3).toFixed(1) + "' font-size='9' fill='#c3cdd9'>" + lab + "</text>"; }
    var line = (IO.isValid(to.arm, ldg.arm)) ? "<line x1='" + x(to.arm).toFixed(1) + "' y1='" + y(to.weight).toFixed(1) + "' x2='" + x(ldg.arm).toFixed(1) + "' y2='" + y(ldg.weight).toFixed(1) + "' stroke='#56c7ff' stroke-width='2'/>" : "";
    // fuel/load bar
    var bar = "<rect x='" + barX + "' y='40' width='16' height='120' fill='#56c7ff'/>" +
      "<text x='" + (barX + 8) + "' y='34' text-anchor='middle' font-size='9' fill='#56c7ff'>Fuel</text>" +
      "<text x='" + (barX + 24) + "' y='100' font-size='9' fill='#56c7ff'>" + Math.round(fuelGal) + " gal</text>" +
      "<text x='" + (barX + 24) + "' y='112' font-size='9' fill='#56c7ff'>" + Math.round(fuelLb) + " lb</text>" +
      "<text x='" + (barX + 8) + "' y='174' text-anchor='middle' font-size='9' fill='#3fd896'>Load</text>";
    return "<svg viewBox='0 0 " + W + " " + H + "' class='f-svg' role='img' aria-label='CG envelope'>" +
      "<polygon points='" + pts + "' fill='rgba(120,140,170,.12)' stroke='#5a6675' stroke-width='1.2'/>" +
      "<text x='" + pad + "' y='12' font-size='9' fill='#8a94a2'>← Fwd     Aft →     (arm in / weight lb)</text>" +
      line + dot(to, "#3fd896", "T/O") + dot(ldg, "#3fd896", "Ldg") + bar + "</svg>";
  };

  /* ===========================================================================
   * DEPARTURE (takeoff)
   * ==========================================================================*/
  pp.depPage = ctl.newPage("departure");
  pp.depPage.stateInfo = function () { var s = condState("dep", true); Object.assign(s, {
    "dep.flaps": { io: "input", type: "option", dflt: "up", options: [{ value: "up", text: "Up" }, { value: "25", text: "25°" }] },
    "dep.roll.ft": { io: "output", type: "number", invalidFn: pp.distErr() }, "dep.obs.ft": { io: "output", type: "number", invalidFn: pp.distErr() },
    "dep.accel.ft": { io: "output", type: "number", invalidFn: pp.distErr() }, "dep.safeRoll.ft": { io: "output", type: "number", fmt: ".0" },
    "dep.safeObs.ft": { io: "output", type: "number", fmt: ".0" }, "dep.rwyLeft.ft": { io: "output", type: "number", fmt: ".0" },
    "dep.vr": { io: "output", type: "number" }, "dep.vobs": { io: "output", type: "number" }, "dep.vx": { io: "output", type: "number" }, "dep.vy": { io: "output", type: "number" },
    "dep.vsClean": { io: "output", type: "number" }, "dep.vsLand": { io: "output", type: "number" }, "dep.va": { io: "output", type: "number" },
    "dep.da.ft": { io: "output", type: "number", fmt: ".0" }, "dep.windTxt": { io: "output", type: "html" }, "dep.accelMsg": { io: "output", type: "html" },
    "dep.graphic": { io: "output", type: "html" }, "dep.summary": { io: "output", type: "html" },
    "dep.rwyHeadingTxt": { io: "output", type: "text" }, "dep.tempInfo": { io: "output", type: "html" }, "dep.note": { io: "output", type: "html" }
  }); return s; };
  pp.depPage.viewTemplate = function () { return { tag: "page", title: "Departure", sub: ac.headerSub(), content: [
    { tag: "cols",
      left: { tag: "group", className: "iGroup", title: "Settings", content: condInputs("dep", true).concat([{ tag: "row", label: "Flaps", content: "{{dep.flaps}}" }]) },
      right: { tag: "group", className: "oGroup", title: "Results", content: [
        { tag: "row", content: "{{dep.graphic}}" },
        { tag: "row", content: "{{dep.summary}}" },
        { tag: "row", content: "{{dep.windTxt}}" },
        { tag: "row", label: "Takeoff roll", content: "{{dep.roll.ft@}} ft", },
        { tag: "row", label: "Runway remaining", content: "{{dep.rwyLeft.ft@}} ft" },
        { tag: "row", label: "50-ft obstacle", content: "{{dep.obs.ft@}} ft @ {{dep.vobs@}} kias" },
        { tag: "row", label: "Safe TORA / obs", content: "{{dep.safeRoll.ft@}} / {{dep.safeObs.ft@}} ft" },
        { tag: "row", label: "Vr / Vx / Vy", content: "{{dep.vr@}} / {{dep.vx@}} / {{dep.vy@}} kias" },
        { tag: "row", label: "Stall (clean / land)", content: "{{dep.vsClean@}} / {{dep.vsLand@}} kias" },
        { tag: "row", label: "VA", content: "{{dep.va@}} kias" },
        { tag: "row", label: "Density altitude", content: "{{dep.da.ft@}} ft" },
        { tag: "row", label: "Accelerate-stop", content: "{{dep.accel.ft@}} ft {{dep.accelMsg}}" }
      ] }
    },
    { tag: "note", content: "{{dep.note}}" }
  ] }; };
  pp.depPage.computeInfo = function () { return [
    { inputs: ["wb.TOweight.lbs"], fn: pp.copyOnChange("wb.TOweight.lbs", "dep.weight.lbs", function (v) { return Math.round(v); }) },
    { inputs: [{ page: "dep", io: "input" }], outputs: [{ page: "dep", io: "output" }], fn: function () { pp.runwayCompute("dep", true); } }
  ]; };

  /* ===========================================================================
   * DESTINATION (landing)
   * ==========================================================================*/
  pp.destPage = ctl.newPage("destination");
  pp.destPage.stateInfo = function () { var s = condState("dest", true); Object.assign(s, {
    "dest.roll.ft": { io: "output", type: "number", invalidFn: pp.distErr() }, "dest.obs.ft": { io: "output", type: "number", invalidFn: pp.distErr() },
    "dest.safeRoll.ft": { io: "output", type: "number", fmt: ".0" }, "dest.safeObs.ft": { io: "output", type: "number", fmt: ".0" }, "dest.rwyLeft.ft": { io: "output", type: "number", fmt: ".0" },
    "dest.vref": { io: "output", type: "number" }, "dest.vx": { io: "output", type: "number" }, "dest.vy": { io: "output", type: "number" },
    "dest.vsClean": { io: "output", type: "number" }, "dest.vsLand": { io: "output", type: "number" }, "dest.va": { io: "output", type: "number" },
    "dest.da.ft": { io: "output", type: "number", fmt: ".0" }, "dest.windTxt": { io: "output", type: "html" },
    "dest.graphic": { io: "output", type: "html" }, "dest.summary": { io: "output", type: "html" },
    "dest.rwyHeadingTxt": { io: "output", type: "text" }, "dest.tempInfo": { io: "output", type: "html" }, "dest.note": { io: "output", type: "html" }
  }); return s; };
  pp.destPage.viewTemplate = function () { return { tag: "page", title: "Destination", sub: ac.headerSub(), content: [
    { tag: "cols",
      left: { tag: "group", className: "iGroup", title: "Settings", content: condInputs("dest", false) },
      right: { tag: "group", className: "oGroup", title: "Results", content: [
        { tag: "row", content: "{{dest.graphic}}" },
        { tag: "row", content: "{{dest.summary}}" },
        { tag: "row", content: "{{dest.windTxt}}" },
        { tag: "row", label: "Landing roll", content: "{{dest.roll.ft@}} ft @ {{dest.vref@}} kias" },
        { tag: "row", label: "Runway remaining", content: "{{dest.rwyLeft.ft@}} ft" },
        { tag: "row", label: "50-ft obstacle", content: "{{dest.obs.ft@}} ft" },
        { tag: "row", label: "Safe LDA / obs", content: "{{dest.safeRoll.ft@}} / {{dest.safeObs.ft@}} ft" },
        { tag: "row", label: "Vref / Vx / Vy", content: "{{dest.vref@}} / {{dest.vx@}} / {{dest.vy@}} kias" },
        { tag: "row", label: "Stall (clean / land)", content: "{{dest.vsClean@}} / {{dest.vsLand@}} kias" },
        { tag: "row", label: "VA", content: "{{dest.va@}} kias" },
        { tag: "row", label: "Density altitude", content: "{{dest.da.ft@}} ft" }
      ] }
    },
    { tag: "note", content: "{{dest.note}}" }
  ] }; };
  pp.destPage.computeInfo = function () { return [
    { inputs: ["wb.ldgWeight.lbs"], fn: pp.copyOnChange("wb.ldgWeight.lbs", "dest.weight.lbs", function (v) { return Math.round(v); }) },
    { inputs: [{ page: "dest", io: "input" }], outputs: [{ page: "dest", io: "output" }], fn: function () { pp.runwayCompute("dest", false); } }
  ]; };

  // shared runway/distance compute for departure & destination
  pp.runwayCompute = function (p, isDep) {
    var a = pp.atmo(p), wt = io(p + ".weight.lbs").val();
    var hdg = pp.rwyHeading(io(p + ".runway").val());
    var w = pp.windComp(hdg, io(p + ".windDir.deg").val(), io(p + ".windSpeed.kt").val());
    var adj = 1 + (io(p + ".adjPct").val() || 0) / 100;
    io(p + ".rwyHeadingTxt").val(((hdg < 100 ? "0" : "") + hdg) + "°");
    // temperature info + range check
    if (IO.isValid(a.oat, a.pa)) io(p + ".tempInfo").val("<span class='dim'>(" + Math.round(a.oat * 9 / 5 + 32) + "°F, " + (a.isa >= 0 ? "+" : "") + Math.round(a.isa) + "°ISA)</span>");
    io(p + ".graphic").val(pp.runwaySVG(hdg, io(p + ".windDir.deg").val(), io(p + ".windSpeed.kt").val()));
    var weightSrc = isDep ? "wb.TOweight.lbs" : "wb.ldgWeight.lbs";
    var fromWB = io(weightSrc) && io(weightSrc).isValid();
    io(p + ".note").val((fromWB ? "Weight from Weight &amp; Balance (" + Math.round(io(weightSrc).val()) + " lb), editable above. " : "Run Weight &amp; Balance to carry your actual weight here. ") +
      "Distances are <b>DIGITIZED · VERIFY</b>. POH publishes no slope/surface/condition correction — those inputs and the ground-roll adjustment % apply only the manual margin you set. Temperatures below 15°C are fully supported via density altitude.");
    if (!IO.isValid(a.oat)) { io(p + ".windTxt").val("<b class='bad'>OAT out of range (POH chart axis −40 to +50°C).</b>"); return; }
    io(p + ".da.ft").val(Math.round(a.da));
    // wind text
    var wt2 = (w.head >= 0 ? "<b class='ok'>Headwind " + Math.round(w.head) + " kt</b>" : "<b class='bad'>Tailwind " + Math.round(-w.head) + " kt</b>");
    if (w.side) wt2 += " · " + (w.side === "right" ? "right" : "left") + " crosswind " + Math.round(w.cross) + " kt";
    io(p + ".windTxt").val(wt2);
    if (!IO.isValid(wt)) return;
    var grK = isDep ? "takeoffGR" : "landingGR", obK = isDep ? "takeoffO50" : "landingO50";
    var roll = ac.data(grK).dist(a.oat, a.pa, wt, w.head), obs = ac.data(obK).dist(a.oat, a.pa, wt, w.head);
    if (typeof roll === "number") roll = Math.round(roll * adj); if (typeof obs === "number") obs = Math.round(obs * adj);
    io(p + ".roll.ft").val(roll); io(p + ".obs.ft").val(obs);
    if (typeof roll === "number") { io(p + ".safeRoll.ft").val(U.roundMult(Math.max(roll * 1.5, obs), "100u")); }
    if (typeof obs === "number") io(p + ".safeObs.ft").val(U.roundMult(obs * 1.5, "100u"));
    var tora = io(p + ".rwyLen.ft").val();
    if (IO.isValid(tora) && tora > 0 && typeof roll === "number") io(p + ".rwyLeft.ft").val(Math.round(tora - roll));
    // speeds
    io(p + ".vx").val(ac.data("speeds").Vxse); io(p + ".vy").val(ac.data("speeds").Vyse);
    io(p + ".vsClean").val(pp.vAdjust(ac.data("speeds").Vs1, wt)); io(p + ".vsLand").val(pp.vAdjust(ac.data("speeds").Vs0, wt)); io(p + ".va").val(pp.va(wt));
    if (isDep) { io("dep.vr").val(ac.data("rotateKias").interpolate(wt)); io("dep.vobs").val(ac.data("obstacleKias").interpolate(wt));
      var accel = ac.data("accelStop").dist(a.oat, a.pa, wt, w.head); if (typeof accel === "number") accel = Math.round(accel * adj);
      io("dep.accel.ft").val(accel);
      if (typeof accel === "number" && IO.isValid(tora) && tora > 0 && accel > tora) io("dep.accelMsg").val("<b class='bad'>&gt; runway length</b>");
    } else { io("dest.vref").val(ac.data("approachKias").interpolate(wt)); }
    // results summary banner
    var head = (w.head >= 0 ? "head " + Math.round(w.head) : "tail " + Math.round(-w.head)) + " kt";
    io(p + ".summary").val("Wt " + Math.round(wt) + " lb · DA " + U.fmtNum(Math.round(a.da)) + " ft · " + head + (w.side ? " · " + Math.round(w.cross) + " kt " + w.side + " xwind" : ""));
  };

  /* ===========================================================================
   * ENROUTE (cruise) — manifold pressure + RPM from POH Fig 5-23
   * ==========================================================================*/
  // interpolate MP for (power,rpm,pa); apply temp correction; detect FT.
  pp.cruiseMP = function (power, rpm, pa, oat) {
    var blk = ac.data("cruisePower")[String(power)]; if (!blk) return { err: "power" };
    var idx = blk.rpms.indexOf(Number(rpm)); if (idx < 0) return { err: "rpm" };
    var pts = blk.rows.filter(function (r) { return r.mp[idx] != null; }).map(function (r) { return { pa: r.pa, mp: r.mp[idx] }; });
    if (!pts.length) return { ft: true, ff: blk.ffPerEngineGph };
    var maxPa = pts[pts.length - 1].pa, minPa = pts[0].pa;
    if (pa > maxPa + 1e-6) return { ft: true, ff: blk.ffPerEngineGph };
    if (pa < minPa) pa = minPa;
    var mp = null, i;
    for (i = 0; i < pts.length - 1; i++) if (pa >= pts[i].pa && pa <= pts[i + 1].pa) { mp = U.interp(pa, pts[i].pa, pts[i].mp, pts[i + 1].pa, pts[i + 1].mp); break; }
    if (mp == null) mp = pts[pts.length - 1].mp;
    var isa = oat - U.stdTemp(pa);
    mp = mp * (1 + ac.data("cruiseMPperC") * isa); // POH note: ±~1% MP per 8°C
    return { mp: U.round(mp, 1), ff: blk.ffPerEngineGph, bhp: blk.bhp };
  };
  pp.enrtPage = ctl.newPage("enroute");
  pp.enrtPage.stateInfo = function () { return {
    "cr.pa.ft": { io: "input", type: "number", min: 0, max: 14000, dflt: 5500, desc: "Cruise pressure altitude" },
    "cr.tempMode": { io: "input", type: "option", dflt: "isa", options: [{ value: "isa", text: "ISA" }, { value: "oat", text: "OAT" }] },
    "cr.isa.dC": { io: "input", type: "number", min: -30, max: 30, dflt: 0, desc: "ISA deviation" },
    "cr.oat.dC": { io: "input", type: "number", min: -50, max: 50, dflt: 4, desc: "OAT" },
    "cr.power": { io: "input", type: "option", dflt: "75", options: [{ value: "55", text: "55%" }, { value: "65", text: "65%" }, { value: "75", text: "75%" }] },
    "cr.rpm": { io: "input", type: "option", dflt: "2400", options: [{ value: "2200" }, { value: "2300" }, { value: "2400" }, { value: "2500" }] },
    "cr.fuel.gal": { io: "input", type: "number", min: 0, max: 108, dflt: 108, desc: "Fuel available" },
    "cr.route.nm": { io: "input", type: "number", min: 0, max: 2000, dflt: 300, desc: "Route distance" },
    "cr.wind.kt": { io: "input", type: "number", min: -60, max: 60, dflt: 0, desc: "Head(+)/tail(−) wind" },
    "cr.reserve.gal": { io: "input", type: "number", min: 0, max: 60, dflt: 12, desc: "Reserve" },
    "cr.oatShow": { io: "output", type: "html" },
    "cr.mp": { io: "output", type: "number", fmt: ".1" }, "cr.rpmOut": { io: "output", type: "number" }, "cr.mcp": { io: "output", type: "number" },
    "cr.gph": { io: "output", type: "number", fmt: ".1" }, "cr.pph": { io: "output", type: "number", fmt: ".0" },
    "cr.tas.kt": { io: "output", type: "number" }, "cr.gs.kt": { io: "output", type: "number" }, "cr.ete": { io: "output", type: "html" },
    "cr.fuelToDest.gal": { io: "output", type: "number", fmt: ".1" }, "cr.fuelAtDest.gal": { io: "output", type: "number", fmt: ".1" },
    "cr.range.nm": { io: "output", type: "number", fmt: ".0" }, "cr.endur": { io: "output", type: "html" }, "cr.eff": { io: "output", type: "number", fmt: ".1" },
    "cr.mpMsg": { io: "output", type: "html" }, "cr.warn": { io: "output", type: "html" }
  }; };
  pp.enrtPage.viewTemplate = function () { return { tag: "page", title: "Enroute", sub: ac.headerSub(), content: [
    { tag: "cols",
      left: { tag: "group", className: "iGroup", title: "Settings", content: [
        { tag: "row", label: "Cruise altitude (ft PA)", content: "{{cr.pa.ft}}" },
        { tag: "row", label: "Temperature", content: "{{cr.tempMode}} · ISA {{cr.isa.dC}} / OAT {{cr.oat.dC}}°C" },
        { tag: "row", label: "OAT used", content: "{{cr.oatShow}}" },
        { tag: "row", label: "Cruise power", content: "{{cr.power}}" },
        { tag: "row", label: "Engine RPM", content: "{{cr.rpm}}" },
        { tag: "row", label: "Route distance (nm)", content: "{{cr.route.nm}}" },
        { tag: "row", label: "Avg wind (kt, +head/−tail)", content: "{{cr.wind.kt}}" },
        { tag: "row", label: "Fuel available (gal)", content: "{{cr.fuel.gal}}" },
        { tag: "row", label: "Min landing reserve (gal)", content: "{{cr.reserve.gal}}" }
      ] },
      right: { tag: "group", className: "oGroup", title: "Results", content: [
        { tag: "row", label: "Power setting", content: "{{cr.rpmOut@}} RPM · {{cr.mp@}} in MP · {{cr.mcp@}}% {{cr.mpMsg}}" },
        { tag: "row", label: "Fuel flow (total)", content: "{{cr.gph@}} gph ({{cr.pph@}} pph)" },
        { tag: "row", label: "True airspeed", content: "{{cr.tas.kt@}} kt · GS {{cr.gs.kt@}} kt" },
        { tag: "row", label: "Fuel to destination", content: "{{cr.fuelToDest.gal@}} gal · ETE {{cr.ete}}" },
        { tag: "row", label: "Fuel at destination", content: "{{cr.fuelAtDest.gal@}} gal {{cr.warn}}" },
        { tag: "row", label: "Range (to reserve)", content: "{{cr.range.nm@}} nm · endurance {{cr.endur}}" },
        { tag: "row", label: "Cruise efficiency", content: "{{cr.eff@}} nmpg" }
      ] }
    },
    { tag: "note", content: "Manifold pressure, RPM and fuel flow come from the POH Fuel &amp; Power Setting Table (Fig 5-23, per engine ×2). MP is temperature-corrected per the POH note (~1% per 8°C from standard). TAS is digitized from Fig 5-25." }
  ] }; };
  pp.enrtPage.computeInfo = function () { return [{ inputs: [{ page: "cr", io: "input" }], outputs: [{ page: "cr", io: "output" }], fn: pp.enrtCompute }]; };
  pp.enrtCompute = function () {
    var pa = io("cr.pa.ft").val(), power = io("cr.power").val();
    var blk = ac.data("cruisePower")[power];
    // RPM options follow power; clamp current rpm
    var cur = io("cr.rpm").val();
    io("cr.rpm").options(blk.rpms.map(function (r) { return { value: String(r) }; }));
    if (blk.rpms.indexOf(Number(cur)) < 0) { cur = String(blk.rpms[blk.rpms.length - 1]); io("cr.rpm").val(cur); }
    var oat = io("cr.tempMode").val() === "oat" ? io("cr.oat.dC").val() : U.stdTemp(pa) + io("cr.isa.dC").val();
    io("cr.oatShow").val(IO.isValid(oat) ? "<b>" + U.round(oat, 0) + " °C</b> <span class='dim'>(ISA " + (U.stdTempDiff(pa, oat) >= 0 ? "+" : "") + Math.round(U.stdTempDiff(pa, oat)) + ")</span>" : "—");
    if (!IO.isValid(pa, oat)) { io("cr.warn").val("<b class='bad'>Altitude/temperature out of range.</b>"); return; }
    var r = pp.cruiseMP(power, cur, pa, oat);
    io("cr.rpmOut").val(Number(cur)); io("cr.mcp").val(Number(power));
    if (r.ft) { io("cr.mp").val(root.INVALID_NULL); io("cr.mpMsg").val("<b class='bad'>full throttle — " + power + "% not available at this RPM/altitude</b>"); }
    else { io("cr.mp").val(r.mp); }
    var ffTotal = r.ff * 2; io("cr.gph").val(ffTotal); io("cr.pph").val(Math.round(ffTotal * ac.data("fuelLbPerGal")));
    var tas = ac.data("cruiseTAS").interpolate(Number(power), pa); if (IO.isValid(tas)) tas = Math.round(tas);
    io("cr.tas.kt").val(tas);
    var wind = io("cr.wind.kt").val(), gs = IO.isValid(tas) ? tas - wind : tas; io("cr.gs.kt").val(IO.isValid(gs) ? Math.round(gs) : gs);
    var route = io("cr.route.nm").val(), fuel = io("cr.fuel.gal").val(), reserve = io("cr.reserve.gal").val();
    if (IO.isValid(gs) && gs > 0 && IO.isValid(route)) {
      var eteH = route / gs; io("cr.ete").val(pp.hm(eteH));
      var fuelToDest = ffTotal * eteH; io("cr.fuelToDest.gal").val(U.round(fuelToDest, 1));
      var atDest = fuel - fuelToDest; io("cr.fuelAtDest.gal").val(U.round(atDest, 1));
      if (IO.isValid(atDest) && atDest < reserve) io("cr.warn").val("<b class='bad'>⚠ below reserve</b>"); else io("cr.warn").val("<b class='ok'>ok</b>");
      io("cr.eff").val(U.round(gs / ffTotal, 1));
    }
    if (ffTotal > 0) { var endH = (fuel - reserve) / ffTotal; io("cr.endur").val(pp.hm(Math.max(0, endH)));
      if (IO.isValid(gs)) io("cr.range.nm").val(Math.round(Math.max(0, endH) * gs)); }
  };
  pp.hm = function (h) { if (!IO.isValid(h)) return "—"; var m = Math.round(h * 60); return Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + (m % 60); };

  /* ===========================================================================
   * CLIMB
   * ==========================================================================*/
  pp.clPage = ctl.newPage("climb");
  pp.clPage.stateInfo = function () { return {
    "cl.pa.ft": { io: "input", type: "number", min: 0, max: 12000, dflt: 0, desc: "Pressure altitude" },
    "cl.oat.dC": { io: "input", type: "number", min: -40, max: 50, dflt: 15, desc: "OAT" },
    "cl.bothUp.fpm": { io: "output", type: "number", invalidFn: pp.distErr() }, "cl.bothDown.fpm": { io: "output", type: "number", invalidFn: pp.distErr() },
    "cl.oneUp.fpm": { io: "output", type: "number", invalidFn: pp.distErr() }, "cl.da": { io: "output", type: "html" }
  }; };
  pp.clPage.viewTemplate = function () { return { tag: "page", title: "Climb", sub: ac.headerSub(), content: [
    { tag: "cols",
      left: { tag: "group", className: "iGroup", title: "Settings", content: [
        { tag: "row", label: "Pressure altitude (ft)", content: "{{cl.pa.ft}}" },
        { tag: "row", label: "OAT (°C)", content: "{{cl.oat.dC}}" }
      ] },
      right: { tag: "group", className: "oGroup", title: "Rate of climb — DIGITIZED · VERIFY", content: [
        { tag: "row", content: "{{cl.da}}" },
        { tag: "row", label: "Two-engine, gear up", content: "{{cl.bothUp.fpm@}} fpm" },
        { tag: "row", label: "Two-engine, gear down", content: "{{cl.bothDown.fpm@}} fpm" },
        { tag: "row", label: "One-engine, gear up", content: "{{cl.oneUp.fpm@}} fpm" },
        { tag: "row", label: "VYSE / VXSE / VSSE", content: ac.data("speeds").Vyse + " / " + ac.data("speeds").Vxse + " / " + ac.data("speeds").Vsse + " kias" }
      ] }
    }
  ] }; };
  pp.clPage.computeInfo = function () { return [{ inputs: [{ page: "cl", io: "input" }], outputs: [{ page: "cl", io: "output" }], fn: function () {
    var pa = io("cl.pa.ft").val(), oat = io("cl.oat.dC").val(); if (!IO.isValid(pa, oat)) { io("cl.da").val("<b class='bad'>Input out of range.</b>"); return; }
    var da = U.densityAlt(pa, oat); io("cl.da").val("Density altitude <b>" + U.fmtNum(Math.round(da)) + "</b> ft");
    io("cl.bothUp.fpm").val(ac.data("climbROC").interpolate("bothUp", da));
    io("cl.bothDown.fpm").val(ac.data("climbROC").interpolate("bothDown", da));
    io("cl.oneUp.fpm").val(ac.data("climbROC").interpolate("oneUp", da));
  } }]; };

  /* ===========================================================================
   * FLIGHT PERFORMANCE (home dashboard)
   * ==========================================================================*/
  pp.homePage = ctl.newPage("home");
  pp.homePage.stateInfo = function () { return {}; };
  pp.homePage.viewTemplate = function () {
    function v(id, suffix) { var e = io(id); if (!e) return "—"; var val = e.val(); if (root.ppUtil.isInvalid(val)) return val === root.INVALID_POH ? "POH" : "—"; return (e.type === "number" ? root.ppUtil.fmtNum(val, (e.info.fmt || "").indexOf(".1") >= 0 ? 1 : 0) : val) + (suffix || ""); }
    return { tag: "dash",
      head: { tag: "group", className: "homeHead", content: [
        { tag: "row", label: "Aircraft", content: [{ tag: "html", content: "{{home.acName}}" }, { tag: "button", title: "Edit", onClick: "home.select('aircraft')" }] }
      ] },
      panels: [
        { tag: "panel", title: "Weight & Balance", onClick: "home.select('wb')", foot: "More / Edit", content: [
          { tag: "html", content: "{{wb.diagram}}" },
          { tag: "row", label: "Status", content: "{{wb.status}}" },
          { tag: "row", label: "Takeoff", content: "{{wb.TOweight.lbs@}} lb · CG {{wb.TOCG.in@}} {{wb.TOstatus}}" },
          { tag: "row", label: "Landing", content: "{{wb.ldgWeight.lbs@}} lb · CG {{wb.ldgCG.in@}} {{wb.ldgStatus}}" }
        ] },
        { tag: "panel", title: "Departure", onClick: "home.select('departure')", foot: "More / Edit", content: [
          { tag: "html", content: "{{dep.graphic}}" },
          { tag: "row", content: "{{dep.windTxt}}" },
          { tag: "row", label: "Takeoff roll", content: "{{dep.roll.ft@}} ft · Vr {{dep.vr@}}" },
          { tag: "row", label: "50-ft obstacle", content: "{{dep.obs.ft@}} ft" },
          { tag: "row", label: "Safe TORA", content: "{{dep.safeRoll.ft@}} ft" }
        ] },
        { tag: "panel", title: "Enroute", onClick: "home.select('enroute')", foot: "More / Edit", content: [
          { tag: "row", label: "Power", content: "{{cr.rpmOut@}} RPM · {{cr.mp@}} in MP · {{cr.mcp@}}%" },
          { tag: "row", label: "Fuel flow", content: "{{cr.gph@}} gph" },
          { tag: "row", label: "TAS / GS", content: "{{cr.tas.kt@}} / {{cr.gs.kt@}} kt" },
          { tag: "row", label: "Fuel to dest", content: "{{cr.fuelToDest.gal@}} gal · ETE {{cr.ete}}" },
          { tag: "row", label: "Reserve check", content: "{{cr.warn}}" }
        ] },
        { tag: "panel", title: "Destination", onClick: "home.select('destination')", foot: "More / Edit", content: [
          { tag: "html", content: "{{dest.graphic}}" },
          { tag: "row", content: "{{dest.windTxt}}" },
          { tag: "row", label: "Landing roll", content: "{{dest.roll.ft@}} ft · Vref {{dest.vref@}}" },
          { tag: "row", label: "50-ft obstacle", content: "{{dest.obs.ft@}} ft" },
          { tag: "row", label: "Safe LDA", content: "{{dest.safeRoll.ft@}} ft" }
        ] }
      ]
    };
  };
  pp.homePage.computeInfo = function () { return [{ inputs: ["ac.reg", "ac.selected"], outputs: ["home.acName"], fn: function () {
    var r = io("ac.reg").val(); io("home.acName").val(r ? "<b>" + r + "</b>" : "<b class='bad'>Default aircraft</b>");
  } }]; };

  /* ===========================================================================
   * REFERENCE & multi-engine
   * ==========================================================================*/
  pp.refP = ctl.newPage("reference");
  pp.refP.stateInfo = function () { return {}; };
  pp.refP.viewTemplate = function () { var s = ac.data("speeds"), asi = ac.data("asi"); return { tag: "page", title: "Reference", sub: ac.headerSub(), content: [
    { tag: "cols",
      left: { tag: "group", className: "oGroup", title: "Single-engine & V-speeds (POH verified)", content: [
        { tag: "row", label: "VMCA (red radial)", content: s.Vmca + " kias" },
        { tag: "row", label: "VYSE (blue) / VXSE", content: s.Vyse + " / " + s.Vxse + " kias" },
        { tag: "row", label: "VSSE", content: s.Vsse + " kias" },
        { tag: "row", label: "VS0 / VS1 (stall)", content: s.Vs0 + " / " + s.Vs1 + " kias" },
        { tag: "row", label: "VNE / VNO", content: s.Vne + " / " + s.Vno + " kias" },
        { tag: "row", label: "VA @3800 / @2700", content: s.Va3800 + " / " + s.Va2700 + " kias" },
        { tag: "row", label: "VLE / VLO ext / ret", content: s.Vle + " / " + s.VloExt + " / " + s.VloRet + " kias" },
        { tag: "row", label: "VFE", content: s.Vfe + " kias" }
      ] },
      right: { tag: "group", className: "oGroup", title: "ASI / limits", content: [
        { tag: "row", label: "Red / yellow arc", content: asi.redline + " · " + asi.yellow[0] + "–" + asi.yellow[1] },
        { tag: "row", label: "Green / white arc", content: asi.green[0] + "–" + asi.green[1] + " · " + asi.white[0] + "–" + asi.white[1] },
        { tag: "row", label: "Blue radial (VYSE)", content: asi.blueRadial },
        { tag: "row", label: "Max ramp / TO / ldg", content: U.fmtNum(ac.data("maxRampWeight")) + " / " + U.fmtNum(ac.data("maxTOweight")) + " / " + U.fmtNum(ac.data("maxLdgWeight")) + " lb" },
        { tag: "row", label: "Load factor", content: ac.data("loadFactors").up + "G / " + ac.data("loadFactors").down + "G" },
        { tag: "row", label: "Demonstrated crosswind", content: ac.data("demonstratedCrosswind") + " kt" },
        { tag: "row", label: "Engine-out", content: "Counter-rotating, no critical engine. 88 KIAS (VYSE), dead prop FEATHERED, 2–3° bank to live engine." }
      ] }
    },
    { tag: "note", content: "Reference / planning only. Best single-engine glide: " + ac.data("notAvailable").bestGlide }
  ] }; };
  pp.refP.computeInfo = function () { return []; };

  // header sub label shared by pages (shows current aircraft, red if default)
  ac.headerSub = function () { var r = io("ac.reg") && io("ac.reg").val(); return r || "Default aircraft"; };

  // late-registered home output (declared after homePage stateInfo runs)
  pp.homePage.stateInfo = function () { return { "home.acName": { io: "output", type: "html" } }; };
})(typeof window !== "undefined" ? window : globalThis);
