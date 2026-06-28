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
  // Geometry is bounded: the arrow tail sits on a compass ring (radius R) and the
  // wind read-out is pinned to the top of the viewBox, so nothing clips at any
  // wind direction. Margins around the ring keep the tail + source dot inside.
  pp.runwaySVG = function (hdg, wdir, wkt) {
    var W = 152, H = 176, cx = 76, cy = 96, R = 58, rin = 22;
    hdg = ((hdg % 360) + 360) % 360;
    var num = Math.round(hdg / 10); if (num === 0) num = 36;
    var lo = (num < 10 ? "0" : "") + num;
    var opp = ((num + 18 - 1) % 36) + 1, hi = (opp < 10 ? "0" : "") + opp;
    var mono = "ui-monospace,SFMono-Regular,Menlo,monospace";
    var s = "";
    // runway slab + dashed centerline + threshold numbers (near end = selected runway)
    s += "<rect x='" + (cx - 15) + "' y='" + (cy - 54) + "' width='30' height='108' rx='4' fill='var(--rwy-slab,#3b4149)'/>";
    s += "<line x1='" + cx + "' y1='" + (cy - 44) + "' x2='" + cx + "' y2='" + (cy + 44) + "' stroke='#f1f4f8' stroke-width='2' stroke-dasharray='7 7' stroke-linecap='round'/>";
    s += "<text x='" + cx + "' y='" + (cy + 50) + "' text-anchor='middle' fill='#fff' font-size='10' font-weight='700' font-family='" + mono + "'>" + lo + "</text>";
    s += "<text x='" + cx + "' y='" + (cy - 44) + "' text-anchor='middle' fill='#fff' font-size='10' font-weight='700' font-family='" + mono + "'>" + hi + "</text>";
    if (IO.isValid(wdir, wkt) && wkt > 0) {
      var delta = ((wdir - hdg) % 360 + 360) % 360, r = delta * Math.PI / 180;
      var tx = cx + R * Math.sin(r), ty = cy - R * Math.cos(r);   // tail on ring (wind source)
      var hx = cx + rin * Math.sin(r), hy = cy - rin * Math.cos(r); // head toward centre
      var head = wkt * Math.cos(r), col = head >= -0.05 ? "#1f9d57" : "#d6453a";
      s += "<circle cx='" + tx.toFixed(1) + "' cy='" + ty.toFixed(1) + "' r='3' fill='" + col + "'/>";
      s += "<line x1='" + tx.toFixed(1) + "' y1='" + ty.toFixed(1) + "' x2='" + hx.toFixed(1) + "' y2='" + hy.toFixed(1) + "' stroke='" + col + "' stroke-width='3.5' stroke-linecap='round'/>";
      // arrowhead: tip at (hx,hy), wings stepped back along the shaft
      var al = 12, aw = 7, bcx = hx + al * Math.sin(r), bcy = hy - al * Math.cos(r);
      s += "<polygon points='" + hx.toFixed(1) + "," + hy.toFixed(1) + " " +
        (bcx + aw * Math.cos(r)).toFixed(1) + "," + (bcy + aw * Math.sin(r)).toFixed(1) + " " +
        (bcx - aw * Math.cos(r)).toFixed(1) + "," + (bcy - aw * Math.sin(r)).toFixed(1) + "' fill='" + col + "'/>";
      var wd = (wdir < 100 ? (wdir < 10 ? "00" : "0") : "") + wdir;
      s += "<text x='" + cx + "' y='15' text-anchor='middle' font-size='11' font-weight='700' fill='" + col + "' font-family='" + mono + "'>" + wd + "° @ " + wkt + " kt</text>";
    } else { s += "<text x='" + cx + "' y='15' text-anchor='middle' font-size='11' font-weight='600' fill='var(--svg-dim,#9aa0a8)' font-family='" + mono + "'>CALM</text>"; }
    return "<svg viewBox='0 0 " + W + " " + H + "' class='f-rwy' role='img' aria-label='runway " + lo + " with wind'>" + s + "</svg>";
  };

  function condState(p, withWind) {
    var s = {};
    s[p + ".elev.ft"] = { io: "input", type: "number", min: -1500, max: 14000, dflt: 0, desc: "Field elevation" };
    s[p + ".oat.dC"] = { io: "input", type: "number", min: -40, max: 50, dflt: 15, desc: "OAT" };
    s[p + ".altimeter.inhg"] = { io: "input", type: "number", min: 28, max: 31, dflt: 29.92, desc: "Altimeter" };
    s[p + ".weight.lbs"] = { io: "input", type: "number", min: 2400, max: 3800, dflt: 3800, desc: "Weight" };
    s[p + ".runway"] = { io: "input", type: "option", dflt: "01", options: rwyOptions() };
    s[p + ".rwyLen.ft"] = { io: "input", type: "number", min: 0, max: 17000, dflt: 0, desc: "Runway length" };
    s[p + ".adjPct"] = { io: "input", type: "number", min: 0, max: 100, dflt: 0, desc: "Ground roll adjustment %" };
    if (withWind) { s[p + ".windDir.deg"] = { io: "input", type: "number", min: 0, max: 360, dflt: 360, desc: "Wind direction" };
      s[p + ".windSpeed.kt"] = { io: "input", type: "number", min: 0, max: 60, dflt: 0, desc: "Wind speed" }; }
    return s;
  }
  function rwyOptions() { var a = [], i; for (i = 1; i <= 36; i++) a.push({ value: (i < 10 ? "0" : "") + i }); return a; }
  function condInputs(p, isDep, hideWhen) {
    function ed(node) { if (hideWhen) node.hide = hideWhen; return node; }
    return [
      ed({ tag: "row", label: "Altitude (ft)", content: "{{" + p + ".elev.ft}}" }),
      ed({ tag: "row", label: "Wind from / speed", content: "{{" + p + ".windDir.deg}} ° @ {{" + p + ".windSpeed.kt}} kt" }),
      ed({ tag: "row", label: "OAT (°C)", content: "{{" + p + ".oat.dC}} {{" + p + ".tempInfo}}" }),
      ed({ tag: "row", label: "Altimeter (inHg)", content: "{{" + p + ".altimeter.inhg}}" }),
      ed({ tag: "row", label: "Runway", content: "{{" + p + ".runway}}" }),
      ed({ tag: "row", label: (isDep ? "Runway TORA (ft)" : "Runway LDA (ft)"), content: "{{" + p + ".rwyLen.ft}}" }),
      { tag: "row", label: "Runway heading", content: "{{" + p + ".rwyHeadingTxt}}" },
      ed({ tag: "row", label: "Ground roll adj (%)", content: "{{" + p + ".adjPct}}" })
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
    "wb.frontL.lbs": { io: "input", type: "number", min: 0, max: 400, dflt: 170, desc: "Pilot" },
    "wb.frontR.lbs": { io: "input", type: "number", min: 0, max: 400, dflt: 170, desc: "Front passenger" },
    "wb.rearL.lbs": { io: "input", type: "number", min: 0, max: 400, dflt: 0, desc: "Rear passenger (left)" },
    "wb.rearR.lbs": { io: "input", type: "number", min: 0, max: 400, dflt: 0, desc: "Rear passenger (right)" },
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
        { tag: "row", label: "Pilot (lb) @ " + st.front.arm + '"', content: "{{wb.frontL.lbs}}" },
        { tag: "row", label: "Front pax (lb) @ " + st.front.arm + '"', content: "{{wb.frontR.lbs}}" },
        { tag: "row", label: "Rear L (lb) @ " + st.rear.arm + '"', content: "{{wb.rearL.lbs}}" },
        { tag: "row", label: "Rear R (lb) @ " + st.rear.arm + '"', content: "{{wb.rearR.lbs}}" },
        { tag: "row", label: "Baggage (lb) ≤200 @ " + st.baggage.arm + '"', content: "{{wb.baggage.lbs}}" }
      ] },
      right: { tag: "group", className: "oGroup", title: "Results", content: [
        { tag: "row", content: "{{wb.diagram}}" },
        { tag: "row", content: "{{wb.status}}" },
        { tag: "row", label: "Takeoff weight", content: "{{wb.TOweight.lbs@}} {{wb.TOstatus}}" },
        { tag: "row", label: "Takeoff CG", content: "{{wb.TOCG.in@}}" },
        { tag: "row", label: "Landing weight", content: "{{wb.ldgWeight.lbs@}} {{wb.ldgStatus}}" },
        { tag: "row", label: "Landing CG", content: "{{wb.ldgCG.in@}}" },
        { tag: "row", label: "Zero-fuel weight / CG", content: "{{wb.zfWeight.lbs@}} · {{wb.zfCG.in@}}" },
        { tag: "row", label: "Ramp weight", content: "{{wb.ramp.lbs@}}" },
        { tag: "row", label: "Max fuel load", content: "{{wb.maxFuel.gal@}}" },
        { tag: "row", label: "Additional payload", content: "{{wb.addPayload.lbs@}}" }
      ] }
    }
  ] }; };
  pp.wbPage.computeInfo = function () { return [{ inputs: [{ page: "wb", io: "input" }, "ac.emptyWeight.lbs", "ac.emptyArm.in"], outputs: [{ page: "wb", io: "output" }], fn: pp.wbCompute }]; };
  pp.wbCompute = function () {
    var st = ac.data("CGstations"), lb = ac.data("fuelLbPerGal"), env = ac.data("CGenvelope");
    var cg = new CGpoint(io("ac.emptyWeight.lbs").val(), io("ac.emptyArm.in").val());
    if (!IO.isValid(cg.weight, cg.arm)) { io("wb.status").val("<b class='bad'>Enter a valid empty weight &amp; arm on the Aircraft page.</b>"); return; }
    // each row has two seats sharing one arm; a blank seat is an empty seat (0),
    // a genuinely invalid entry propagates so results read "check input".
    function seat(id) { var v = io(id).val(); return v === root.INVALID_NULL ? 0 : v; }
    function rowSum(a, b) { var x = seat(a), y = seat(b); return !IO.isValid(x) ? x : !IO.isValid(y) ? y : x + y; }
    var frontLb = rowSum("wb.frontL.lbs", "wb.frontR.lbs"), rearLb = rowSum("wb.rearL.lbs", "wb.rearR.lbs");
    cg.add(frontLb, st.front.arm); cg.add(rearLb, st.rear.arm); cg.add(io("wb.baggage.lbs").val(), st.baggage.arm);
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
    var payloadLb = frontLb + rearLb + io("wb.baggage.lbs").val();
    io("wb.diagram").val(pp.envelopeSVG(env, to, ldg, io("wb.fuel.gal").val(), io("wb.fuel.gal").val() * lb, payloadLb));
  };
  pp.envelopeSVG = function (env, to, ldg, fuelGal, fuelLb, payloadLb) {
    var W = 340, H = 230, padL = 30, padR = 96, padT = 26, padB = 30;
    var plotR = W - padR;                 // right edge of the envelope plot
    var poly = env.points();
    var ws = poly.map(function (p) { return p.weight; }).concat([env.minWeight]);
    var as = poly.map(function (p) { return p.arm; });
    var wMin = Math.min.apply(null, ws), wMax = Math.max.apply(null, ws.concat([to.weight, ldg.weight]));
    var aMin = Math.min.apply(null, as) - 1, aMax = Math.max.apply(null, as) + 1;
    function x(a) { return padL + (a - aMin) / (aMax - aMin) * (plotR - padL); }
    function y(w) { return H - padB - (w - wMin) / (wMax - wMin) * (H - padT - padB); }
    var pts = poly.map(function (p) { return x(p.arm).toFixed(1) + "," + y(p.weight).toFixed(1); }).join(" ");
    function dot(cg, c, lab, below) { if (!IO.isValid(cg.weight, cg.arm)) return "";
      var cxv = x(cg.arm), cyv = y(cg.weight), ly = below ? cyv + 13 : cyv - 7;
      return "<circle cx='" + cxv.toFixed(1) + "' cy='" + cyv.toFixed(1) + "' r='4.5' fill='" + c + "'/>" +
        "<text x='" + cxv.toFixed(1) + "' y='" + ly.toFixed(1) + "' text-anchor='middle' font-size='9' fill='var(--svg-ink,#222)' font-weight='700'>" + lab + "</text>"; }
    var line = (IO.isValid(to.arm, ldg.arm)) ? "<line x1='" + x(to.arm).toFixed(1) + "' y1='" + y(to.weight).toFixed(1) + "' x2='" + x(ldg.arm).toFixed(1) + "' y2='" + y(ldg.weight).toFixed(1) + "' stroke='#1c3fbf' stroke-width='2'/>" : "";

    // proportional stacked fuel(blue)/load(green) bar
    var bx = plotR + 30, bw = 18, bTop = padT + 6, bBot = H - padB, bH = bBot - bTop;
    var fLb = IO.isValid(fuelLb) ? Math.max(0, fuelLb) : 0;
    var pLb = IO.isValid(payloadLb) ? Math.max(0, payloadLb) : 0;
    var tot = fLb + pLb;
    var hF = tot > 0 ? bH * fLb / tot : 0, hL = tot > 0 ? bH * pLb / tot : 0;
    var blue = "#1c3fbf", green = "#1f9d57", lx = bx + bw + 4;
    var bar =
      "<rect x='" + bx + "' y='" + bTop + "' width='" + bw + "' height='" + bH + "' fill='var(--svg-track,#eceef1)' stroke='var(--svg-line,#c4c8ce)'/>" +
      "<rect x='" + bx + "' y='" + bTop.toFixed(1) + "' width='" + bw + "' height='" + hF.toFixed(1) + "' fill='" + blue + "'/>" +
      "<rect x='" + bx + "' y='" + (bTop + hF).toFixed(1) + "' width='" + bw + "' height='" + hL.toFixed(1) + "' fill='" + green + "'/>" +
      "<text x='" + (bx + bw / 2).toFixed(1) + "' y='" + (bTop - 6).toFixed(1) + "' text-anchor='middle' font-size='9' fill='" + blue + "' font-weight='700'>Fuel</text>" +
      "<text x='" + lx + "' y='" + (bTop + 12).toFixed(1) + "' font-size='9' fill='" + blue + "' font-weight='700'>" + Math.round(fuelGal) + " gal</text>" +
      "<text x='" + lx + "' y='" + (bTop + 24).toFixed(1) + "' font-size='9' fill='" + blue + "' font-weight='700'>" + Math.round(fLb) + " lb</text>" +
      "<text x='" + lx + "' y='" + (bBot - 4).toFixed(1) + "' font-size='9' fill='" + green + "' font-weight='700'>" + Math.round(pLb) + " lb</text>" +
      "<text x='" + (bx + bw / 2).toFixed(1) + "' y='" + (bBot + 11).toFixed(1) + "' text-anchor='middle' font-size='9' fill='" + green + "' font-weight='700'>Load</text>";

    return "<svg viewBox='0 0 " + W + " " + H + "' class='f-svg' role='img' aria-label='CG envelope and loading'>" +
      "<text x='" + padL + "' y='12' font-size='9' fill='var(--svg-dim,#777)'>CG envelope — arm (in) vs weight (lb)</text>" +
      "<polygon points='" + pts + "' fill='var(--svg-fill,rgba(120,120,140,.10))' stroke='var(--svg-stroke,#444)' stroke-width='1.2'/>" +
      "<text x='" + padL + "' y='" + (H - 6) + "' font-size='9' fill='var(--svg-dim,#777)'>← Fwd</text>" +
      "<text x='" + (plotR).toFixed(1) + "' y='" + (H - 6) + "' text-anchor='end' font-size='9' fill='var(--svg-dim,#777)'>Aft →</text>" +
      line + dot(to, "#1c3fbf", "T/O", false) + dot(ldg, "#0d8f4f", "Ldg", true) + bar + "</svg>";
  };

  /* ===========================================================================
   * DEPARTURE (takeoff)
   * ==========================================================================*/
  pp.depPage = ctl.newPage("departure");
  pp.depPage.stateInfo = function () { var s = condState("dep", true); Object.assign(s, {
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
      left: { tag: "group", className: "iGroup", title: "Settings", content: condInputs("dep", true) },
      right: { tag: "group", className: "oGroup", title: "Results", content: [
        { tag: "row", className: "rwyrow", content: "{{dep.graphic}}" },
        { tag: "row", content: "{{dep.summary}}" },
        { tag: "row", content: "{{dep.windTxt}}" },
        { tag: "row", label: "Takeoff roll", content: "{{dep.roll.ft@}}", },
        { tag: "row", label: "Runway remaining", content: "{{dep.rwyLeft.ft@}}" },
        { tag: "row", label: "50-ft obstacle", content: "{{dep.obs.ft@}} @ {{dep.vobs@}} kias" },
        { tag: "row", label: "Safe TORA / obs", content: "{{dep.safeRoll.ft@}} / {{dep.safeObs.ft@}}" },
        { tag: "row", label: "Vr / Vx / Vy", content: "{{dep.vr@}} / {{dep.vx@}} / {{dep.vy@}} kias" },
        { tag: "row", label: "Stall (clean / land)", content: "{{dep.vsClean@}} / {{dep.vsLand@}} kias" },
        { tag: "row", label: "VA", content: "{{dep.va@}} kias" },
        { tag: "row", label: "Density altitude", content: "{{dep.da.ft@}}" },
        { tag: "row", label: "Accelerate-stop", content: "{{dep.accel.ft@}} {{dep.accelMsg}}" }
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
    "dest.linkDep": { io: "input", type: "option", dflt: "no", options: [{ value: "no", text: "No (enter separately)" }, { value: "yes", text: "Yes (same as Departure)" }] },
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
      left: { tag: "group", className: "iGroup", title: "Settings", content: [
        { tag: "row", label: "Use departure settings", content: "{{dest.linkDep}}" },
        { tag: "row", label: "", content: "<span class='dim'>Altitude, wind, OAT, altimeter, runway &amp; TORA copied from Departure.</span>", show: { "dest.linkDep": "yes" } }
      ].concat(condInputs("dest", false, { "dest.linkDep": "yes" })) },
      right: { tag: "group", className: "oGroup", title: "Results", content: [
        { tag: "row", className: "rwyrow", content: "{{dest.graphic}}" },
        { tag: "row", content: "{{dest.summary}}" },
        { tag: "row", content: "{{dest.windTxt}}" },
        { tag: "row", label: "Landing roll", content: "{{dest.roll.ft@}} @ {{dest.vref@}} kias" },
        { tag: "row", label: "Runway remaining", content: "{{dest.rwyLeft.ft@}}" },
        { tag: "row", label: "50-ft obstacle", content: "{{dest.obs.ft@}}" },
        { tag: "row", label: "Safe LDA / obs", content: "{{dest.safeRoll.ft@}} / {{dest.safeObs.ft@}}" },
        { tag: "row", label: "Vref / Vx / Vy", content: "{{dest.vref@}} / {{dest.vx@}} / {{dest.vy@}} kias" },
        { tag: "row", label: "Stall (clean / land)", content: "{{dest.vsClean@}} / {{dest.vsLand@}} kias" },
        { tag: "row", label: "VA", content: "{{dest.va@}} kias" },
        { tag: "row", label: "Density altitude", content: "{{dest.da.ft@}}" }
      ] }
    },
    { tag: "note", content: "{{dest.note}}" }
  ] }; };
  pp.destPage.computeInfo = function () { return [
    { inputs: ["wb.ldgWeight.lbs"], fn: pp.copyOnChange("wb.ldgWeight.lbs", "dest.weight.lbs", function (v) { return Math.round(v); }) },
    { inputs: ["dest.linkDep", { page: "dep", io: "input" }], fn: function () {
        if (io("dest.linkDep").val() !== "yes") return;
        ["elev.ft", "oat.dC", "altimeter.inhg", "windDir.deg", "windSpeed.kt", "runway", "rwyLen.ft"].forEach(function (k) {
          io("dest." + k).val(io("dep." + k).val());
        });
    } },
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
      "Distances are <b>DIGITIZED · VERIFY</b>. The ground-roll adjustment % applies only the manual margin you set. Temperatures below 15°C are fully supported via density altitude.");
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
      io("dep.accelMsg").val(typeof accel === "number" && IO.isValid(tora) && tora > 0 && accel > tora ? "<b class='bad'>&gt; runway length</b>" : "");
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
  // Work backwards on the climb chart: find the density altitude where rate of
  // climb falls to targetFpm (50 = service ceiling, 0 = absolute ceiling).
  // The climb line is near-linear; beyond the charted points we extrapolate
  // along the last segment's slope (flagged to the user as derived/VERIFY).
  pp.ceiling = function (config, targetFpm, weight) {
    var slices = ac.data("ceilingByWeight")[config];
    if (!slices) return root.INVALID_NULL;
    var ws = Object.keys(slices).map(Number).sort(function (a, b) { return a - b; });
    var pts;                                           // [{p:da, v:fpm}], da asc, fpm desc
    if (ws.length >= 2 && IO.isValid(weight)) {
      var w = Math.max(ws[0], Math.min(ws[ws.length - 1], weight)); // no extrapolation past data
      var lo = ws[0], hi = ws[ws.length - 1], k;
      for (k = 0; k < ws.length - 1; k++) { if (w >= ws[k] && w <= ws[k + 1]) { lo = ws[k]; hi = ws[k + 1]; break; } }
      var pL = slices[lo], pH = slices[hi];
      pts = pL.map(function (pt, idx) {
        return { p: pt.da, v: lo === hi ? pt.fpm : U.interp(w, lo, pt.fpm, hi, pH[idx].fpm) };
      });
    } else {
      pts = slices[ws[0]].map(function (pt) { return { p: pt.da, v: pt.fpm }; });
    }
    if (pts.length < 2) return root.INVALID_NULL;
    if (targetFpm >= pts[0].v) return pts[0].p;        // already at/below target at SL
    var i;
    for (i = 0; i < pts.length - 1; i++) {
      if (targetFpm <= pts[i].v && targetFpm >= pts[i + 1].v) {
        return U.interp(targetFpm, pts[i].v, pts[i].p, pts[i + 1].v, pts[i + 1].p);
      }
    }
    var n = pts.length, a1 = pts[n - 2], a2 = pts[n - 1];
    var slope = (a2.v - a1.v) / (a2.p - a1.p);         // fpm per ft (negative)
    if (slope >= 0) return root.INVALID_NULL;
    return a2.p + (targetFpm - a2.v) / slope;
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
    "cr.mpMsg": { io: "output", type: "html" }, "cr.warn": { io: "output", type: "html" },
    "cr.svcCeil2": { io: "output", type: "number", fmt: ".0" }, "cr.absCeil2": { io: "output", type: "number", fmt: ".0" },
    "cr.svcCeil1": { io: "output", type: "number", fmt: ".0" }, "cr.absCeil1": { io: "output", type: "number", fmt: ".0" },
    "cr.ceilWt.lbs": { io: "output", type: "number", fmt: ".0" }
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
        { tag: "row", label: "True airspeed", content: "{{cr.tas.kt@}} · GS {{cr.gs.kt@}}" },
        { tag: "row", label: "Fuel to destination", content: "{{cr.fuelToDest.gal@}} · ETE {{cr.ete}}" },
        { tag: "row", label: "Fuel at destination", content: "{{cr.fuelAtDest.gal@}} {{cr.warn}}" },
        { tag: "row", label: "Range (to reserve)", content: "{{cr.range.nm@}} · endurance {{cr.endur}}" },
        { tag: "row", label: "Cruise efficiency", content: "{{cr.eff@}} nmpg" },
        { tag: "row", label: "Ceiling basis weight", content: "{{cr.ceilWt.lbs@}} <span class='dim'>(takeoff weight from W&amp;B)</span>" },
        { tag: "row", label: "Two-engine ceiling", content: "service {{cr.svcCeil2@}} ft · absolute {{cr.absCeil2@}} ft" },
        { tag: "row", label: "One-engine ceiling", content: "service {{cr.svcCeil1@}} ft · absolute {{cr.absCeil1@}} ft" }
      ] }
    },
    { tag: "note", content: "Manifold pressure, RPM and fuel flow come from the POH Fuel &amp; Power Setting Table (Fig 5-23, per engine ×2). MP is temperature-corrected per the POH note (~1% per 8°C from standard). TAS is digitized from Fig 5-25. Service (50 fpm) and absolute (0 fpm) ceilings are derived by working backwards along the digitized climb-rate lines (Figs 5-17/5-19) and extrapolated beyond the charted altitudes — <b>DERIVED · VERIFY</b>. They vary with the takeoff weight from Weight &amp; Balance; only the max-gross (3,800 lb) climb line is digitized so far, so add the POH weight lines to make the weight variation exact." }
  ] }; };
  pp.enrtPage.computeInfo = function () { return [{ inputs: [{ page: "cr", io: "input" }], outputs: [{ page: "cr", io: "output" }], fn: pp.enrtCompute }]; };
  pp.enrtCompute = function () {
    function r100(v) { return IO.isValid(v) ? Math.round(v / 100) * 100 : v; }
    // ceilings are derived from the climb-rate lines and vary with weight; use the
    // computed takeoff weight from W&B, falling back to max gross if unavailable.
    var ceilWt = io("wb.TOweight.lbs").val(); if (!IO.isValid(ceilWt)) ceilWt = ac.data("maxTOweight");
    io("cr.ceilWt.lbs").val(Math.round(ceilWt));
    io("cr.svcCeil2").val(r100(pp.ceiling("bothUp", 50, ceilWt))); io("cr.absCeil2").val(r100(pp.ceiling("bothUp", 0, ceilWt)));
    io("cr.svcCeil1").val(r100(pp.ceiling("oneUp", 50, ceilWt)));  io("cr.absCeil1").val(r100(pp.ceiling("oneUp", 0, ceilWt)));
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
        { tag: "row", label: "Two-engine, gear up", content: "{{cl.bothUp.fpm@}}" },
        { tag: "row", label: "Two-engine, gear down", content: "{{cl.bothDown.fpm@}}" },
        { tag: "row", label: "One-engine, gear up", content: "{{cl.oneUp.fpm@}}" },
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
        { tag: "row", label: "Aircraft", content: [{ tag: "html", content: "{{home.acName}}" }, { tag: "button", title: "Edit", onClick: "home.select('aircraft')" }, { tag: "button", title: "Print / Save PDF", onClick: "pp.printReport()" }] }
      ] },
      panels: [
        { tag: "panel", title: "Weight & Balance", onClick: "home.select('wb')", foot: "More / Edit", content: [
          { tag: "html", content: "{{wb.diagram}}" },
          { tag: "row", label: "Status", content: "{{wb.status}}" },
          { tag: "row", label: "Takeoff", content: "{{wb.TOweight.lbs@}} · CG {{wb.TOCG.in@}} {{wb.TOstatus}}" },
          { tag: "row", label: "Landing", content: "{{wb.ldgWeight.lbs@}} · CG {{wb.ldgCG.in@}} {{wb.ldgStatus}}" }
        ] },
        { tag: "panel", title: "Departure", onClick: "home.select('departure')", foot: "More / Edit", content: [
          { tag: "html", content: "{{dep.graphic}}" },
          { tag: "row", content: "{{dep.windTxt}}" },
          { tag: "row", label: "Takeoff roll", content: "{{dep.roll.ft@}} · Vr {{dep.vr@}}" },
          { tag: "row", label: "50-ft obstacle", content: "{{dep.obs.ft@}}" },
          { tag: "row", label: "Safe TORA", content: "{{dep.safeRoll.ft@}}" }
        ] },
        { tag: "panel", title: "Enroute", onClick: "home.select('enroute')", foot: "More / Edit", content: [
          { tag: "row", label: "Power", content: "{{cr.rpmOut@}} RPM · {{cr.mp@}} in MP · {{cr.mcp@}}%" },
          { tag: "row", label: "Fuel flow", content: "{{cr.gph@}} gph" },
          { tag: "row", label: "TAS / GS", content: "{{cr.tas.kt@}} / {{cr.gs.kt@}}" },
          { tag: "row", label: "Fuel to dest", content: "{{cr.fuelToDest.gal@}} · ETE {{cr.ete}}" },
          { tag: "row", label: "Reserve check", content: "{{cr.warn}}" }
        ] },
        { tag: "panel", title: "Destination", onClick: "home.select('destination')", foot: "More / Edit", content: [
          { tag: "html", content: "{{dest.graphic}}" },
          { tag: "row", content: "{{dest.windTxt}}" },
          { tag: "row", label: "Landing roll", content: "{{dest.roll.ft@}} · Vref {{dest.vref@}}" },
          { tag: "row", label: "50-ft obstacle", content: "{{dest.obs.ft@}}" },
          { tag: "row", label: "Safe LDA", content: "{{dest.safeRoll.ft@}}" }
        ] }
      ]
    };
  };
  pp.homePage.computeInfo = function () { return [{ inputs: ["ac.reg", "ac.selected"], outputs: ["home.acName"], fn: function () {
    var r = io("ac.reg").val(); io("home.acName").val(r ? "<b>" + r + "</b>" : "<b class='bad'>Default aircraft</b>");
  } }]; };

  /* ===========================================================================
   * SETTINGS — theme, planning defaults, data management, about
   * ==========================================================================*/
  // Theme: persisted choice applied via data-theme on <html> ("auto" = follow OS).
  pp.applyTheme = function () {
    var mode = Store.get("pa44.theme") || "auto";
    var el = root.document && root.document.documentElement; if (!el) return;
    if (mode === "light" || mode === "dark") el.setAttribute("data-theme", mode); else el.removeAttribute("data-theme");
  };
  pp.setTheme = function (mode) { Store.set("pa44.theme", mode); pp.applyTheme(); if (root.view) root.view.render(); };
  // Copy the saved planning defaults into the live Departure/Destination/Enroute inputs.
  pp.applyDefaults = function () {
    var a = io("set.adjPct").val(), r = io("set.reserve.gal").val();
    if (IO.isValid(a)) { io("dep.adjPct").val(a); io("dest.adjPct").val(a); }
    if (IO.isValid(r)) io("cr.reserve.gal").val(r);
    ctl.change(); if (root.view) root.view.render();
  };
  pp.resetInputs = function () { if (root.confirm && !root.confirm("Reset all inputs to defaults? Saved aircraft profiles are kept.")) return; Store.del("pa44.inputs"); root.location.reload(); };
  pp.clearProfiles = function () { if (root.confirm && !root.confirm("Delete ALL saved aircraft profiles on this device? This cannot be undone.")) return; Store.del(PKEY); Store.del(LKEY); root.location.reload(); };

  // Format any state id as "value unit" for the printable report (and reuse elsewhere).
  pp.pv = function (id) {
    var e = io(id); if (!e) return "—";
    var v = e.val(); if (root.ppUtil.isInvalid(v)) return v === root.INVALID_POH ? "POH" : "—";
    var pretty = { dC: "°C", inhg: "inHg", deg: "°" }, out;
    if (e.type === "html") out = String(v).replace(/<[^>]+>/g, "").trim();
    else if (e.type === "number") out = root.ppUtil.fmtNum(v, (e.info.fmt || "").indexOf(".1") >= 0 ? 1 : 0);
    else out = String(v);
    return out + (e.unit ? " " + (pretty[e.unit] || e.unit) : "");
  };
  // Build a print-only report of all applicable data and open the browser print
  // dialog (Save as PDF). No libraries — works fully offline.
  pp.printReport = function () {
    var doc = root.document;
    function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function row(l, v) { return "<tr><td>" + esc(l) + "</td><td>" + esc(v) + "</td></tr>"; }
    function sec(t, rows) { return "<div class='p-sec'><h2>" + esc(t) + "</h2><table>" + rows + "</table></div>"; }
    var reg = (io("ac.reg") && io("ac.reg").val()) || "Default aircraft";
    var n = new Date(), p2 = function (x) { return (x < 10 ? "0" : "") + x; };
    var stamp = n.getFullYear() + "-" + p2(n.getMonth() + 1) + "-" + p2(n.getDate()) + " " + p2(n.getHours()) + ":" + p2(n.getMinutes());
    var wb = sec("Weight & Balance",
      row("Status", pp.pv("wb.status")) + row("Takeoff weight", pp.pv("wb.TOweight.lbs")) + row("Takeoff CG", pp.pv("wb.TOCG.in")) +
      row("Landing weight", pp.pv("wb.ldgWeight.lbs")) + row("Landing CG", pp.pv("wb.ldgCG.in")) +
      row("Zero-fuel weight", pp.pv("wb.zfWeight.lbs")) + row("Ramp weight", pp.pv("wb.ramp.lbs")) + row("Fuel on board", pp.pv("wb.fuel.gal")));
    var dep = sec("Departure",
      row("Runway", pp.pv("dep.runway")) + row("Wind", pp.pv("dep.windTxt")) + row("Density altitude", pp.pv("dep.da.ft")) +
      row("Takeoff roll", pp.pv("dep.roll.ft")) + row("50-ft obstacle", pp.pv("dep.obs.ft")) + row("Accelerate-stop", pp.pv("dep.accel.ft")) +
      row("Safe TORA / obs", pp.pv("dep.safeRoll.ft") + " / " + pp.pv("dep.safeObs.ft")) + row("Vr", pp.pv("dep.vr")));
    var climb = sec("Climb",
      row("Pressure altitude", pp.pv("cl.pa.ft")) + row("OAT", pp.pv("cl.oat.dC")) +
      row("Two-engine, gear up", pp.pv("cl.bothUp.fpm")) + row("Two-engine, gear down", pp.pv("cl.bothDown.fpm")) + row("One-engine, gear up", pp.pv("cl.oneUp.fpm")));
    var enr = sec("Enroute / Cruise",
      row("Cruise altitude", pp.pv("cr.pa.ft")) + row("Power", pp.pv("cr.mcp") + "% · " + pp.pv("cr.rpmOut") + " RPM · " + pp.pv("cr.mp") + " inMP") +
      row("Fuel flow", pp.pv("cr.gph") + " gph") + row("TAS / GS", pp.pv("cr.tas.kt") + " / " + pp.pv("cr.gs.kt")) +
      row("Fuel to / at dest", pp.pv("cr.fuelToDest.gal") + " / " + pp.pv("cr.fuelAtDest.gal")) + row("Range to reserve", pp.pv("cr.range.nm")) +
      row("Ceiling basis weight", pp.pv("cr.ceilWt.lbs")) +
      row("2-eng ceiling svc/abs", pp.pv("cr.svcCeil2") + " / " + pp.pv("cr.absCeil2")) + row("1-eng ceiling svc/abs", pp.pv("cr.svcCeil1") + " / " + pp.pv("cr.absCeil1")));
    var dest = sec("Destination",
      row("Runway", pp.pv("dest.runway")) + row("Wind", pp.pv("dest.windTxt")) + row("Density altitude", pp.pv("dest.da.ft")) +
      row("Landing roll", pp.pv("dest.roll.ft")) + row("50-ft obstacle", pp.pv("dest.obs.ft")) +
      row("Safe LDA / obs", pp.pv("dest.safeRoll.ft") + " / " + pp.pv("dest.safeObs.ft")) + row("Vref", pp.pv("dest.vref")));
    var html = "<h1>PA-44-180 Seminole — Performance Plan</h1>" +
      "<p class='p-sub'>Aircraft: " + esc(reg) + " &nbsp;·&nbsp; Generated " + stamp + " &nbsp;·&nbsp; Reference / planning only</p>" +
      "<div class='p-cols'>" + wb + dep + climb + enr + dest + "</div>" +
      "<p class='p-foot'>Reference / planning aid only — not a substitute for the approved POH, official charts, or a current weight-and-balance record. Distances &amp; climb figures are digitized from POH charts. Verify every value before flight.</p>";
    var el = doc.getElementById("f-print"); if (!el) { el = doc.createElement("div"); el.id = "f-print"; doc.body.appendChild(el); }
    el.innerHTML = html;
    root.print();
  };

  pp.setPage = ctl.newPage("settings");
  pp.setPage.stateInfo = function () { return {
    "set.adjPct": { io: "input", type: "number", min: 0, max: 100, dflt: 0, desc: "Default ground-roll margin" },
    "set.reserve.gal": { io: "input", type: "number", min: 0, max: 60, dflt: 12, desc: "Default reserve fuel" }
  }; };
  pp.setPage.viewTemplate = function () {
    var theme = Store.get("pa44.theme") || "auto";
    function seg(mode, label) { return "<button class='" + (theme === mode ? "on" : "") + "' onclick=\"pp.setTheme('" + mode + "')\">" + label + "</button>"; }
    var themeCtl = "<div class='f-seg'>" + seg("light", "Light") + seg("dark", "Dark") + seg("auto", "Auto") + "</div>";
    return { tag: "page", title: "Settings", sub: ac.headerSub(), content: [
      { tag: "cols",
        left: { tag: "group", className: "iGroup", title: "Appearance", content: [
          { tag: "row", label: "Theme", content: themeCtl },
          { tag: "row", content: "<span class='dim'>Auto follows your device’s light/dark setting; Light/Dark override it on this device.</span>" }
        ] },
        right: { tag: "group", className: "iGroup", title: "Planning defaults", content: [
          { tag: "row", label: "Ground-roll margin (%)", content: "{{set.adjPct}}" },
          { tag: "row", label: "Reserve fuel (gal)", content: "{{set.reserve.gal}}" },
          { tag: "row", content: "<button class='f-btn' onclick='pp.applyDefaults()'>Apply to current plan</button>" },
          { tag: "row", content: "<span class='dim'>Copies these into the Departure/Destination ground-roll margin and the Enroute reserve.</span>" }
        ] }
      },
      { tag: "cols",
        left: { tag: "group", className: "oGroup", title: "Data management (this device only)", content: [
          { tag: "row", content: "<button class='f-btn' onclick='pp.resetInputs()'>Reset all inputs</button> <button class='f-btn f-danger' onclick='pp.clearProfiles()'>Clear aircraft profiles</button>" },
          { tag: "row", content: "<span class='dim'>Nothing is sent anywhere — all data stays in this browser’s local storage.</span>" }
        ] },
        right: { tag: "group", className: "oGroup", title: "About & provenance", content: [
          { tag: "row", label: "Aircraft", content: ac.data("model") },
          { tag: "row", label: "Document", content: ac.data("document") },
          { tag: "row", label: "Datum", content: ac.data("datumNote") },
          { tag: "row", label: "Max ramp / TO / ldg", content: U.fmtNum(ac.data("maxRampWeight")) + " / " + U.fmtNum(ac.data("maxTOweight")) + " / " + U.fmtNum(ac.data("maxLdgWeight")) + " lb" },
          { tag: "row", label: "Fuel", content: ac.data("fuelUsableGal") + " gal usable · " + ac.data("fuelLbPerGal") + " lb/gal" }
        ] }
      },
      { tag: "note", content: "Reference / planning aid only — not a substitute for the approved POH, official charts, or a current weight-and-balance record. Distances &amp; climb figures are digitized from POH charts; verify every value before flight." }
    ] }; };
  pp.setPage.computeInfo = function () { return []; };

  // header sub label shared by pages (shows current aircraft, red if default)
  ac.headerSub = function () { var r = io("ac.reg") && io("ac.reg").val(); return r || "Default aircraft"; };

  // late-registered home output (declared after homePage stateInfo runs)
  pp.homePage.stateInfo = function () { return { "home.acName": { io: "output", type: "html" } }; };
})(typeof window !== "undefined" ? window : globalThis);
