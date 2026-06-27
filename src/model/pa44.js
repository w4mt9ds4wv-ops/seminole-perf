/* =============================================================================
 * PA-44-180 SEMINOLE — aircraft model (the "M" in MVC).
 * Single source of truth for every number. Registered via ac.addModel().
 *
 * verified:true  -> discrete value printed in the POH (text/table/ASI marking).
 * verified:false -> DIGITIZED from a Section-5 graphical nomograph (no printed
 *                   table). Calibrated to the chart's worked example; APPROXIMATE
 *                   and flagged "DIGITIZED · VERIFY" in the UI.
 * Source: "VB-1616 PA-44-180 Pilot's Operating Handbook", issued July 12 1995.
 * ===========================================================================*/
(function (root) {
  "use strict";
  var U = root.ppUtil, Ptable = root.Ptable, CGpoint = root.CGpoint, CGenvelope = root.CGenvelope;

  /* ---- separable distance model (calibrated to each chart's example) ----
   * distance = cal * baseline(densityAlt) * weightMult(weight) * windMult(wind)
   * baseline read at 3800 lb / zero wind from the chart's pressure-altitude
   * lines; weight fan normalized to 1.0 @ 3800; wind fan as head/tail %/kt.   */
  function table1(rows, xk, yk, x) {
    var s = rows.slice().sort(function (a, b) { return a[xk] - b[xk]; });
    if (x < s[0][xk] - 1e-9 || x > s[s.length - 1][xk] + 1e-9) return null;
    if (x <= s[0][xk]) return s[0][yk];
    if (x >= s[s.length - 1][xk]) return s[s.length - 1][yk];
    for (var i = 0; i < s.length - 1; i++)
      if (x >= s[i][xk] && x <= s[i + 1][xk]) return U.interp(x, s[i][xk], s[i][yk], s[i + 1][xk], s[i + 1][yk]);
    return null;
  }
  // baseline distance vs density altitude. Cold air gives NEGATIVE density
  // altitude; the POH chart's temperature axis extends to -40C (well below the
  // lowest digitized anchor), and its lower region is essentially linear, so we
  // linearly extrapolate the baseline below the first anchor rather than clamp
  // to a 15C / DA-0 floor. The hot/high end still refuses beyond the chart.
  function baseDist(rows, da) {
    var s = rows.slice().sort(function (a, b) { return a.da_ft - b.da_ft; });
    var lo = s[0], hi = s[s.length - 1];
    if (da > hi.da_ft + 1e-9) return null;             // beyond hot/high chart edge
    if (da < lo.da_ft) {                                // colder than lowest anchor: extrapolate down
      var a0 = s[0], a1 = s[1];
      var v = a0.dist_ft + (da - a0.da_ft) / (a1.da_ft - a0.da_ft) * (a1.dist_ft - a0.dist_ft);
      return Math.max(v, 1);                            // never non-positive
    }
    return table1(rows, "da_ft", "dist_ft", da);
  }
  function windMult(m, w) { return w >= 0 ? Math.max(0.5, 1 - m.windHeadPerKt * w) : 1 + m.windTailPerKt * (-w); }
  function makeDistanceModel(spec) {
    var m = spec; m._cal = null;
    function cal() {
      if (m._cal != null) return m._cal;
      var e = m.example, c = 1;
      var da = U.densityAlt(e.pa_ft, e.oat_c);
      var b = table1(m.baselineByDA, "da_ft", "dist_ft", da), w = table1(m.weightTable, "weight", "mult", e.weight_lb);
      if (b != null && w != null) c = e.result_ft / (b * w * windMult(m, e.wind_kt));
      m._cal = c; return c;
    }
    m.daRange = { min: m.baselineByDA[0].da_ft, max: m.baselineByDA[m.baselineByDA.length - 1].da_ft };
    m.wtRange = { min: Math.min.apply(null, m.weightTable.map(function (r) { return r.weight; })),
                  max: Math.max.apply(null, m.weightTable.map(function (r) { return r.weight; })) };
    // Returns {ft} or a PtableError-compatible object for out-of-envelope.
    m.dist = function (oat, pa, weight, wind) {
      wind = wind || 0;
      var da = U.densityAlt(pa, oat);
      var b = baseDist(m.baselineByDA, da);
      var w = table1(m.weightTable, "weight", "mult", weight);
      if (b == null) return new root.PtableError("too high", "density altitude");
      if (w == null) return new root.PtableError(weight > m.wtRange.max ? "too high" : "too low", "weight");
      if (wind < -10 || wind > 30) return new root.PtableError(wind > 30 ? "too high" : "too low", "wind");
      return U.round(cal() * b * w * windMult(m, wind));
    };
    return m;
  }

  ac_addModel();
  function ac_addModel() {
    root.ac.addModel({
      model: "PA-44-180",
      document: "VB-1616 Pilot's Operating Handbook",
      issued: "July 12, 1995",
      note: "Reference / planning aid only. The official POH and current aircraft documents are authoritative.",

      // --- General / engine (VERIFIED) ---
      engineLeft: "Lycoming O-360-A1H6", engineRight: "Lycoming LO-360-A1H6",
      maxHP: 180, maxRPM: 2700, maxCHT: 500, maxOilTemp: 245, seats: 4,

      // --- Weight limits (VERIFIED) ---
      maxRampWeight: 3816, maxTOweight: 3800, maxLdgWeight: 3800, maxBaggage: 200,
      // EDITABLE placeholders — replace with YOUR airframe's W&B record.
      dfltEmptyWeight: 2430, dfltEmptyArm: 88.5,

      // --- Fuel (VERIFIED) ---
      fuelTotalGal: 110, fuelUsableGal: 108, fuelUnusableGal: 2,
      fuelLbPerGal: 6.0, taxiFuelLb: 16.0, fuelGrade: "100LL or 100",

      // --- W&B stations / arms (VERIFIED, Section 6) ---
      CGstations: {
        front:   { arm: 80.5,  label: "Pilot & front passenger" },
        rear:    { arm: 118.1, label: "Rear passengers" },
        fuel:    { arm: 95.0,  label: "Fuel (108 gal usable)", max: 108 },
        baggage: { arm: 142.8, label: "Baggage (200 lb limit)", max: 200 }
      },
      taxiArm: 95.0,
      CGempty: new CGpoint(2430, 88.5), // placeholder default
      datumNote: "Datum is 78.4 in. ahead of the wing leading edge at wing station 106.",

      // --- CG envelope (VERIFIED) — straight-line variation, aft constant 93.0 ---
      CGenvelope: new CGenvelope({
        title: "C.G. envelope",
        minWeight: 2400,
        fwd: [{ weight: 2800, arm: 84.0 }, { weight: 3400, arm: 85.0 }, { weight: 3800, arm: 89.0 }],
        aft: [{ weight: 2800, arm: 93.0 }, { weight: 3800, arm: 93.0 }]
      }),

      // --- Airspeeds KIAS (VERIFIED) ---
      speeds: {
        Vne: 202, Vno: 169, Va3800: 135, Va2700: 112, Vle: 140, VloExt: 140, VloRet: 109,
        Vfe: 111, Vyse: 88, Vxse: 82, Vmca: 56, Vsse: 82, Vs0: 55, Vs1: 57
      },
      asi: { redline: 202, yellow: [169, 202], green: [57, 169], white: [55, 111], blueRadial: 88 },
      loadFactors: { up: 3.8, down: 2.0 },
      demonstratedCrosswind: 17,

      // --- Cruise fuel flow (VERIFIED printed table; 3480 lb, cowl closed) ---
      cruiseFF: new Ptable({
        title: "Cruise fuel flow (gph)",
        parmNames: ["mode", "power"], parmLimits: ["", "B"],
        a: [
          { p: "perf", a: [{ p: 55, v: 17.4 }, { p: 65, v: 20.4 }, { p: 75, v: 23.3 }] },
          { p: "econ", a: [{ p: 55, v: 14.0 }, { p: 65, v: 16.6 }, { p: 75, v: 19.2 }] }
        ]
      }),
      // --- Cruise TAS (DIGITIZED, Fig 5-25) ---
      cruiseTAS: new Ptable({
        title: "Cruise true airspeed (kt)", verified: false,
        parmNames: ["power", "pa"], parmLimits: ["B", "B"],
        a: [
          { p: 55, a: [{ p: 0, v: 133 }, { p: 5500, v: 140 }, { p: 8000, v: 142 }] },
          { p: 65, a: [{ p: 0, v: 143 }, { p: 8000, v: 152 }] },
          { p: 75, a: [{ p: 0, v: 152 }, { p: 8000, v: 160 }] }
        ]
      }),

      // --- Cruise FUEL & POWER SETTING TABLE (VERIFIED, Fig 5-23, per engine) ---
      // Manifold pressure (in. Hg) by % power -> RPM -> pressure altitude.
      // null = "FT" (full throttle: that power not attainable at that RPM/altitude).
      // NOTE per POH: add ~1% MP per 8°C above standard temp; subtract per 8°C below.
      // per-engine fuel flow (VERIFIED Fig 5-23/5-25); total = ×2
      cruiseFFperEng: { perf: { "55": 8.7, "65": 10.2, "75": 11.7 }, econ: { "55": 7.0, "65": 8.3, "75": 9.6 } },

      // --- Cruise power setting (VERIFIED, Fig 5-23 "Fuel & Power Setting
      //     Table", LYCOMING (L)O-360-A1H6, PER ENGINE). mp[] aligns to rpms[];
      //     null = "FT" (full throttle, that power unavailable at that RPM/alt).
      //     Temp note: ±1% MP per 8°C from standard to hold constant power.   ---
      cruisePower: {
        "55": { bhp: 99, ffPerEngineGph: 8.7, rpms: [2100, 2200, 2300, 2400], rows: [
          { pa: 0, mp: [22.3, 21.7, 21.1, 20.6] }, { pa: 1000, mp: [22.0, 21.3, 20.8, 20.3] },
          { pa: 2000, mp: [21.7, 21.0, 20.5, 20.0] }, { pa: 3000, mp: [21.3, 20.7, 20.2, 19.8] },
          { pa: 4000, mp: [21.1, 20.5, 20.0, 19.5] }, { pa: 5000, mp: [20.8, 20.2, 19.7, 19.2] },
          { pa: 6000, mp: [20.5, 19.9, 19.4, 19.0] }, { pa: 7000, mp: [20.2, 19.7, 19.2, 18.7] },
          { pa: 8000, mp: [20.0, 19.4, 18.9, 18.5] }, { pa: 9000, mp: [19.7, 19.1, 18.7, 18.2] },
          { pa: 10000, mp: [19.5, 18.9, 18.4, 18.0] }, { pa: 11000, mp: [19.2, 18.7, 18.2, 17.8] },
          { pa: 12000, mp: [null, 18.4, 18.0, 17.6] }, { pa: 13000, mp: [null, null, null, 17.4] }
        ] },
        "65": { bhp: 117, ffPerEngineGph: 10.2, rpms: [2100, 2200, 2300, 2400], rows: [
          { pa: 0, mp: [24.9, 24.2, 23.5, 22.9] }, { pa: 1000, mp: [24.6, 23.8, 23.2, 22.6] },
          { pa: 2000, mp: [24.2, 23.5, 22.9, 22.3] }, { pa: 3000, mp: [23.9, 23.2, 22.6, 22.0] },
          { pa: 4000, mp: [23.5, 22.8, 22.3, 21.8] }, { pa: 5000, mp: [23.2, 22.5, 22.0, 21.5] },
          { pa: 6000, mp: [22.9, 22.2, 21.7, 21.3] }, { pa: 7000, mp: [null, 21.9, 21.5, 21.0] },
          { pa: 8000, mp: [null, null, 21.2, 20.8] }, { pa: 9000, mp: [null, null, null, 20.6] }
        ] },
        "75": { bhp: 135, ffPerEngineGph: 11.7, rpms: [2200, 2300, 2400, 2500], rows: [
          { pa: 0, mp: [26.7, 26.0, 25.2, 24.6] }, { pa: 1000, mp: [26.3, 25.6, 24.9, 24.3] },
          { pa: 2000, mp: [25.9, 25.3, 24.6, 24.0] }, { pa: 3000, mp: [25.6, 25.0, 24.4, 23.7] },
          { pa: 4000, mp: [null, 24.7, 24.1, 23.5] }, { pa: 5000, mp: [null, null, 23.8, 23.2] },
          { pa: 6000, mp: [null, null, null, 22.9] }
        ] }
      },
      cruiseMPperC: 0.01 / 8, // fractional MP change per °C from standard (POH note)

      // --- Climb ROC (DIGITIZED) — Ptable over [config, da] ---
      climbROC: new Ptable({
        title: "Rate of climb (fpm)", verified: false,
        parmNames: ["config", "da"], parmLimits: ["", "B"],
        a: [
          { p: "bothUp",   a: [{ p: 0, v: 1340 }, { p: 5000, v: 1000 }, { p: 10000, v: 640 }] },
          { p: "bothDown", a: [{ p: 0, v: 1050 }, { p: 5000, v: 750 }] },
          { p: "oneUp",    a: [{ p: 0, v: 220 }, { p: 5000, v: 80 }] }
        ]
      }),

      // --- Distance charts (DIGITIZED separable models) ---
      takeoffGR: makeDistanceModel({
        figure: "Figure 5-11", title: "Takeoff Ground Roll — Short Field", verified: false,
        conditions: ["Flaps 0°", "Cowl flaps OPEN", "2700 RPM & full throttle before brake release", "Paved, level, dry"],
        caution: "Best one-engine-inoperative ROC is < 50 FPM if takeoff weight is in the chart's shaded area.",
        example: { oat_c: 8, pa_ft: 1250, weight_lb: 3430, wind_kt: 6, result_ft: 860 },
        baselineByDA: [{ da_ft: 0, dist_ft: 1100 }, { da_ft: 2475, dist_ft: 1330 }, { da_ft: 4950, dist_ft: 1620 }, { da_ft: 7426, dist_ft: 2000 }, { da_ft: 8700, dist_ft: 2200 }],
        weightTable: [{ weight: 3000, mult: 0.636 }, { weight: 3400, mult: 0.800 }, { weight: 3800, mult: 1.0 }],
        windHeadPerKt: 0.016, windTailPerKt: 0.030
      }),
      takeoffO50: makeDistanceModel({
        figure: "Figure 5-13", title: "Takeoff Over 50 ft — Short Field", verified: false,
        conditions: ["Flaps 0°", "Cowl flaps OPEN", "2700 RPM & full throttle before brake release", "Paved, level, dry"],
        example: { oat_c: 8, pa_ft: 1250, weight_lb: 3430, wind_kt: 6, result_ft: 1520 },
        baselineByDA: [{ da_ft: 0, dist_ft: 1900 }, { da_ft: 2475, dist_ft: 2300 }, { da_ft: 4950, dist_ft: 2800 }, { da_ft: 7426, dist_ft: 3300 }, { da_ft: 8700, dist_ft: 3550 }],
        weightTable: [{ weight: 3000, mult: 0.660 }, { weight: 3400, mult: 0.821 }, { weight: 3800, mult: 1.0 }],
        windHeadPerKt: 0.016, windTailPerKt: 0.030
      }),
      accelStop: makeDistanceModel({
        figure: "Figure 5-10", title: "Accelerate & Stop — Short Field", verified: false,
        conditions: ["Both engines 2700 RPM & full throttle", "Mixture full rich", "Flaps 0°", "Abort at rotation speed", "Cowl flaps OPEN", "Paved, level, dry", "Max braking"],
        example: { oat_c: 8, pa_ft: 680, weight_lb: 3430, wind_kt: 5, result_ft: 1750 },
        baselineByDA: [{ da_ft: 0, dist_ft: 2300 }, { da_ft: 2475, dist_ft: 2750 }, { da_ft: 4950, dist_ft: 3300 }, { da_ft: 7426, dist_ft: 4000 }, { da_ft: 8700, dist_ft: 4350 }],
        weightTable: [{ weight: 3000, mult: 0.606 }, { weight: 3400, mult: 0.812 }, { weight: 3800, mult: 1.0 }],
        windHeadPerKt: 0.012, windTailPerKt: 0.024
      }),
      landingGR: makeDistanceModel({
        figure: "Figure 5-35", title: "Landing Ground Roll — Short Field", verified: false,
        conditions: ["Flaps 40°", "Power OFF", "Cowl flaps OPEN", "Paved, level, dry", "Full-stall touchdown"],
        example: { oat_c: 8, pa_ft: 680, weight_lb: 3107, wind_kt: 5, result_ft: 542 },
        baselineByDA: [{ da_ft: 0, dist_ft: 660 }, { da_ft: 4950, dist_ft: 800 }, { da_ft: 8700, dist_ft: 900 }],
        weightTable: [{ weight: 3000, mult: 0.848 }, { weight: 3800, mult: 1.0 }],
        windHeadPerKt: 0.011, windTailPerKt: 0.022
      }),
      landingO50: makeDistanceModel({
        figure: "Figure 5-33", title: "Landing Over 50 ft — Short Field", verified: false,
        conditions: ["Flaps 40°", "Power OFF", "Cowl flaps as required", "Paved, level, dry", "Full-stall touchdown", "Approach speed as scheduled"],
        example: { oat_c: 8, pa_ft: 680, weight_lb: 3107, wind_kt: 5, result_ft: 1238 },
        baselineByDA: [{ da_ft: 0, dist_ft: 1500 }, { da_ft: 4950, dist_ft: 1850 }, { da_ft: 8700, dist_ft: 2150 }],
        weightTable: [{ weight: 3000, mult: 0.860 }, { weight: 3800, mult: 1.0 }],
        windHeadPerKt: 0.012, windTailPerKt: 0.024
      }),

      // --- Speed-by-weight tables (VERIFIED, printed on charts) ---
      rotateKias:   new Ptable({ title: "Rotate (Vr)", parmNames: ["weight"], parmLimits: ["B"], rndMult: "1u",
        a: [{ p: 2600, v: 57 }, { p: 3000, v: 62 }, { p: 3400, v: 66 }, { p: 3800, v: 70 }] }),
      obstacleKias: new Ptable({ title: "50-ft obstacle speed", parmNames: ["weight"], parmLimits: ["B"], rndMult: "1u",
        a: [{ p: 2600, v: 67 }, { p: 3000, v: 72 }, { p: 3400, v: 77 }, { p: 3800, v: 82 }] }),
      approachKias: new Ptable({ title: "Approach speed", parmNames: ["weight"], parmLimits: ["B"], rndMult: "1u",
        a: [{ p: 2600, v: 62 }, { p: 3000, v: 67 }, { p: 3400, v: 72 }, { p: 3800, v: 75 }] }),


      // --- Not published in this POH (flagged in-app, never invented) ---
      notAvailable: {
        descentChart: "Fig 5-31 (Fuel, Time & Distance to Descend) is a fuel/time/distance planner, not a descent-rate chart. The Descent page uses a geometric planner from pilot-entered rate/speed.",
        runwaySlope: "POH charts assume a LEVEL runway; no slope correction is published.",
        runwaySurface: "POH charts assume a PAVED, DRY runway; no unpaved/contaminated correction is published.",
        singleEngineCeiling: "No single-engine service ceiling number is published; infer from the one-engine climb chart where ROC = 50 FPM.",
        bestGlide: "No best single-engine glide ratio chart is published.",
        goAround: "No go-around / balked-landing distance chart is published."
      }
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
