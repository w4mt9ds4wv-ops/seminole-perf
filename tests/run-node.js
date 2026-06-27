/* =============================================================================
 * PA-44-180 Seminole — Node integration test (no browser, DOM + localStorage
 * shims). Exercises the 14-item validation checklist plus regression of every
 * verified POH example number. Run: node tests/run-node.js
 * ===========================================================================*/
var fs = require("fs"), vm = require("vm");
process.chdir(require("path").join(__dirname, ".."));

/* ---- minimal DOM shim ---------------------------------------------------- */
function El() { this._html = ""; this.classList = { add() {}, remove() {}, toggle() {} }; this.style = {}; }
Object.defineProperty(El.prototype, "innerHTML", { get() { return this._html; }, set(v) { this._html = String(v); } });
El.prototype.querySelectorAll = function () { return []; };
El.prototype.querySelector = function () { return null; };
El.prototype.scrollTo = function () {}; El.prototype.focus = function () {};
El.prototype.getAttribute = function () { return ""; }; El.prototype.addEventListener = function () {};
var els = {};
global.document = {
  getElementById: function (id) { return els[id] || (els[id] = new El()); },
  querySelectorAll: function () { return []; }, querySelector: function () { return null; },
  addEventListener: function () {}, readyState: "complete"
};
global.window = global; global.navigator = { onLine: true };
global.location = { protocol: "file:", origin: "null" };
/* ---- localStorage shim (so the real JSON-encode/decode path is tested) --- */
var _ls = {};
global.localStorage = {
  getItem: function (k) { return k in _ls ? _ls[k] : null; },
  setItem: function (k, v) { _ls[k] = String(v); },
  removeItem: function (k) { delete _ls[k]; }
};
global.alert = function () {}; global.confirm = function () { return true; };

["src/framework/framework.js", "src/model/pa44.js", "src/page/pages.js"].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });
});
var io = window.io, IO = window.IO, ctl = window.ctl, ac = window.ac, view = window.view,
    pp = window.pp, U = window.ppUtil, Store = window.Store;

var pass = 0, fail = 0;
function eq(n, a, b) { if (a === b) { pass++; } else { fail++; console.log("FAIL " + n + " - expected " + b + " got " + a); } }
function near(n, a, b, tol) { if (typeof a === "number" && Math.abs(a - b) <= (tol || 0.05)) { pass++; } else { fail++; console.log("FAIL " + n + " - expected ~" + b + " got " + a); } }
function ok(n, c) { if (c) { pass++; } else { fail++; console.log("FAIL " + n); } }

/* =========================================================================
 * A. Regression - every VERIFIED POH example reproduces (no PA-28 data)
 * =======================================================================*/
var GR = ac.data("takeoffGR"), O50 = ac.data("takeoffO50"), AS = ac.data("accelStop"),
    LGR = ac.data("landingGR"), LO = ac.data("landingO50");
eq("TO ground roll ex -> 860", GR.dist(8, 1250, 3430, 6), 860);
eq("TO over-50 ex -> 1520", O50.dist(8, 1250, 3430, 6), 1520);
eq("Accel-stop ex -> 1750", AS.dist(8, 680, 3430, 5), 1750);
eq("Landing GR ex -> 542", LGR.dist(8, 680, 3107, 5), 542);
eq("Landing over-50 ex -> 1238", LO.dist(8, 680, 3107, 5), 1238);
eq("Climb both gear up SL -> 1340", ac.data("climbROC").interpolate("bothUp", 0), 1340);
eq("Climb one-engine SL -> 220", ac.data("climbROC").interpolate("oneUp", 0), 220);
eq("Rotate Vr @3800 -> 70", ac.data("rotateKias").interpolate(3800), 70);
eq("Obstacle V @3800 -> 82", ac.data("obstacleKias").interpolate(3800), 82);
eq("Approach Vref @3800 -> 75", ac.data("approachKias").interpolate(3800), 75);
eq("Cruise TAS 55%@5500 -> 140", Math.round(ac.data("cruiseTAS").interpolate(55, 5500)), 140);
eq("Cruise FF 65% perf total -> 20.4", ac.data("cruiseFF").interpolate("perf", 65), 20.4);
eq("Cruise FF 55% econ total -> 14.0", ac.data("cruiseFF").interpolate("econ", 55), 14.0);
var env = ac.data("CGenvelope");
eq("CG fwd limit @3400 -> 85.0", env.limits(3400).fwd, 85.0);
eq("CG aft limit constant -> 93.0", env.limits(3800).aft, 93.0);

/* monotonicity + no-extrapolation guards */
ok("headwind shortens ground roll", GR.dist(15, 0, 3800, 15) < GR.dist(15, 0, 3800, 0));
ok("lighter weight shortens ground roll", GR.dist(15, 0, 3000, 0) < GR.dist(15, 0, 3800, 0));
ok("beyond chart envelope -> PtableError", GR.dist(45, 13000, 3800, 0) instanceof window.PtableError);

/* =========================================================================
 * B. (#7) Sub-15C performance is fully supported (no 15C floor)
 * =======================================================================*/
ok("GR computes at OAT -10 (number)", typeof GR.dist(-10, 0, 3800, 0) === "number");
ok("GR computes at OAT -30 (number)", typeof GR.dist(-30, 0, 3800, 0) === "number");
ok("cold gives shorter roll than hot", GR.dist(-20, 0, 3800, 0) < GR.dist(40, 0, 3800, 0));
ok("climb better when cold", ac.data("climbROC").interpolate("bothUp", U.densityAlt(0, -20)) > ac.data("climbROC").interpolate("bothUp", U.densityAlt(0, 40)));

/* =========================================================================
 * C. (#12) Cruise manifold pressure + RPM match the POH Fig 5-23 table
 * =======================================================================*/
eq("MP 75% 2400 @3000 std -> 24.4", pp.cruiseMP("75", 2400, 3000, U.stdTemp(3000)).mp, 24.4);
eq("MP 75% 2500 @SL std -> 24.6", pp.cruiseMP("75", 2500, 0, U.stdTemp(0)).mp, 24.6);
eq("MP 55% 2100 @SL std -> 22.3", pp.cruiseMP("55", 2100, 0, U.stdTemp(0)).mp, 22.3);
eq("MP 65% 2400 @9000 std -> 20.6", pp.cruiseMP("65", 2400, 9000, U.stdTemp(9000)).mp, 20.6);
ok("FT detected: 75% 2200 @5000", pp.cruiseMP("75", 2200, 5000, U.stdTemp(5000)).ft === true);
ok("FT detected: 65% 2100 @7000", pp.cruiseMP("65", 2100, 7000, U.stdTemp(7000)).ft === true);
ok("per-engine FF 75% -> 11.7", pp.cruiseMP("75", 2400, 3000, U.stdTemp(3000)).ff === 11.7);
var stdMP = pp.cruiseMP("75", 2400, 3000, U.stdTemp(3000)).mp;
ok("warmer than std raises MP", pp.cruiseMP("75", 2400, 3000, U.stdTemp(3000) + 16).mp > stdMP);
ok("colder than std lowers MP", pp.cruiseMP("75", 2400, 3000, U.stdTemp(3000) - 16).mp < stdMP);

/* =========================================================================
 * D. (#11) Wind components - head/tail + L/R crosswind sign correctness
 * =======================================================================*/
var w1 = pp.windComp(360, 360, 10); near("pure headwind head=10", w1.head, 10); near("pure headwind cross=0", w1.cross, 0); ok("headwind has no side", w1.side === "");
var w2 = pp.windComp(360, 180, 10); near("pure tailwind head=-10", w2.head, -10);
var w3 = pp.windComp(360, 90, 10); near("90deg right cross=10", w3.cross, 10); ok("right crosswind side", w3.side === "right"); near("90deg head~0", w3.head, 0, 0.1);
var w4 = pp.windComp(360, 270, 10); ok("left crosswind side", w4.side === "left"); near("270deg cross=10", w4.cross, 10);
var w5 = pp.windComp(90, 45, 14); ok("quartering headwind +", w5.head > 0); ok("quartering from left", w5.side === "left");

/* =========================================================================
 * E. Framework init + render all pages (#5 results on every page)
 * =======================================================================*/
view.mount = global.document.getElementById("f-main");
ctl.init(); ctl.change();
var pages = ctl.pageOrder(); var rok = 0;
pages.forEach(function (id) {
  try { ctl.current(id); view.render(); if (view.mount.innerHTML.length > 80) rok++; else console.log("thin render " + id); }
  catch (e) { console.log("RENDER FAIL " + id + ": " + e.message); }
});
eq("all pages render non-empty", rok, pages.length);

/* =========================================================================
 * F. (#1,#2,#3) Aircraft profile manager CRUD + auto-port to W&B
 * =======================================================================*/
io("ac.reg").setInput("n123ab");
io("ac.emptyWeight.lbs").setInput(2455); io("ac.emptyArm.in").setInput(89.1);
pp.profileSave();
var profs = pp.profiles();
ok("profile stored as array (localStorage path)", Array.isArray(profs) && profs.length === 1);
ok("registration upper-cased", profs[0].reg === "N123AB");
eq("profile bew saved", profs[0].bew, 2455);
eq("profile arm saved", profs[0].arm, 89.1);
ok("localStorage actually holds JSON", typeof _ls["pa44.profiles"] === "string" && _ls["pa44.profiles"].indexOf("N123AB") >= 0);

io("ac.emptyWeight.lbs").setInput(2460); pp.profileSave();
eq("only one profile after edit (no dup)", pp.profiles().length, 1);
eq("profile updated bew", pp.profiles()[0].bew, 2460);

io("ac.reg").setInput("N999ZZ"); io("ac.emptyWeight.lbs").setInput(2500); io("ac.emptyArm.in").setInput(88.0); pp.profileSave();
eq("two profiles", pp.profiles().length, 2);

pp.loadProfile("N123AB");
eq("load ports BEW to ac.emptyWeight", io("ac.emptyWeight.lbs").val(), 2460);
eq("load ports arm to ac.emptyArm", io("ac.emptyArm.in").val(), 89.1);
eq("last-selected remembered", Store.get("pa44.lastProfile"), "N123AB");

io("wb.fuel.gal").setInput(90); io("wb.burn.gal").setInput(30); io("wb.taxi.gal").setInput(2.7);
io("wb.front.lbs").setInput(340); io("wb.rear.lbs").setInput(170); io("wb.baggage.lbs").setInput(50);
ctl.change();
var tow = io("wb.TOweight.lbs").val(), ldw = io("wb.ldgWeight.lbs").val();
ok("W&B TO weight uses loaded BEW (~3544)", Math.abs(tow - 3544) <= 2);
ok("W&B Ldg weight sensible (~3364)", Math.abs(ldw - 3364) <= 2);
ok("W&B within-limits status", String(io("wb.status").val()).indexOf("Within all limits") >= 0);

io("ac.selected").val("N999ZZ"); pp.profileDelete();
eq("one profile after delete", pp.profiles().length, 1);
ok("deleted reg gone", pp.profiles().filter(function (p) { return p.reg === "N999ZZ"; }).length === 0);

/* regression: a freshly typed (unsaved) registration must survive recompute */
pp.profileNew();
ok("profileNew clears registration", String(io("ac.reg").val() || "") === "");
io("ac.reg").setInput("N55TYP"); ctl.change(); ctl.change();
eq("typed reg survives recompute (not wiped)", io("ac.reg").val(), "N55TYP");
ok("unsaved typed reg not persisted as profile", pp.profiles().filter(function (p) { return p.reg === "N55TYP"; }).length === 0);
pp.loadProfile("N123AB");

/* =========================================================================
 * G. (#3,#4) W&B TO/Ldg weights port to Departure / Destination
 * =======================================================================*/
ctl.change();
eq("Departure weight ported from W&B TO", io("dep.weight.lbs").val(), Math.round(tow));
eq("Destination weight ported from W&B Ldg", io("dest.weight.lbs").val(), Math.round(ldw));

/* =========================================================================
 * H. (#5,#9,#10) Departure compute: distances, graphic, runway/wind
 * =======================================================================*/
io("dep.elev.ft").setInput(1250); io("dep.oat.dC").setInput(8); io("dep.altimeter.inhg").setInput(29.92);
io("dep.runway").val("01"); io("dep.windDir.deg").setInput(10); io("dep.windSpeed.kt").setInput(6);
io("dep.rwyLen.ft").setInput(1600);
ctl.change();
ok("Departure takeoff roll is a number", typeof io("dep.roll.ft").val() === "number");
ok("Departure obstacle is a number", typeof io("dep.obs.ft").val() === "number");
ok("Departure accel-stop is a number", typeof io("dep.accel.ft").val() === "number");
ok("Departure DA computed", typeof io("dep.da.ft").val() === "number");
ok("Departure Vr present", typeof io("dep.vr").val() === "number");
ok("runway graphic is SVG", String(io("dep.graphic").val()).indexOf("<svg") === 0);
ok("runway graphic shows runway number 01", String(io("dep.graphic").val()).indexOf(">01<") >= 0);
ok("wind text reports headwind", String(io("dep.windTxt").val()).indexOf("Headwind") >= 0);
io("dep.runway").val("18"); ctl.change();
ok("graphic updates on runway change (18)", String(io("dep.graphic").val()).indexOf(">18<") >= 0);
ok("wind becomes tailwind on opposite runway", String(io("dep.windTxt").val()).indexOf("Tailwind") >= 0);
io("dep.runway").val("09"); io("dep.windDir.deg").setInput(180); io("dep.windSpeed.kt").setInput(12); ctl.change();
ok("crosswind shown for 90deg wind", String(io("dep.windTxt").val()).indexOf("crosswind") >= 0);
io("dep.runway").val("01"); io("dep.windDir.deg").setInput(10); io("dep.windSpeed.kt").setInput(0); io("dep.rwyLen.ft").setInput(800); ctl.change();
ok("accel-stop > runway length flagged", String(io("dep.accelMsg").val()).indexOf("runway length") >= 0);

/* =========================================================================
 * I. (#7,#8) Departure below 15C computes; out-of-range OAT warns
 * =======================================================================*/
io("dep.oat.dC").setInput(-10); ctl.change();
ok("Departure roll computes at OAT -10", typeof io("dep.roll.ft").val() === "number");
ok("DA lower than ISA when cold", io("dep.da.ft").val() < 1250);
io("dep.oat.dC").setInput(60); ctl.change();
ok("OAT 60 rejected as invalid input", !IO.isValid("dep.oat.dC"));
ok("out-of-range OAT shows warning", String(io("dep.windTxt").val()).indexOf("out of range") >= 0);
io("dep.oat.dC").setInput(15); ctl.change();

/* =========================================================================
 * J. (#5) Enroute cruise compute end-to-end (MP/RPM/FF/TAS)
 * =======================================================================*/
io("cr.power").val("75"); io("cr.rpm").val("2400"); io("cr.pa.ft").setInput(3000);
io("cr.tempMode").val("isa"); io("cr.isa.dC").setInput(0);
io("cr.route.nm").setInput(300); io("cr.wind.kt").setInput(0); io("cr.fuel.gal").setInput(108); io("cr.reserve.gal").setInput(12);
ctl.change();
eq("Enroute MP 75%/2400/3000 std -> 24.4", io("cr.mp").val(), 24.4);
eq("Enroute RPM out -> 2400", io("cr.rpmOut").val(), 2400);
eq("Enroute MCP% -> 75", io("cr.mcp").val(), 75);
eq("Enroute total FF 75% -> 23.4", io("cr.gph").val(), 23.4);
ok("Enroute TAS computed", typeof io("cr.tas.kt").val() === "number");
ok("Enroute ETE computed", String(io("cr.ete").val()).indexOf(":") >= 0);
ok("Enroute fuel-to-dest computed", typeof io("cr.fuelToDest.gal").val() === "number");
io("cr.rpm").val("2200"); io("cr.pa.ft").setInput(6000); ctl.change();
ok("Enroute flags full-throttle (FT)", String(io("cr.mpMsg").val()).indexOf("full throttle") >= 0);
io("cr.power").val("65"); io("cr.rpm").val("2400"); io("cr.pa.ft").setInput(8000); io("cr.tempMode").val("isa"); io("cr.isa.dC").setInput(-20); ctl.change();
ok("Enroute computes at ISA-20 (cold)", typeof io("cr.mp").val() === "number");

/* =========================================================================
 * K. (#4) W&B out-of-envelope / overweight warnings flag clearly
 * =======================================================================*/
io("ac.emptyWeight.lbs").setInput(2460); io("ac.emptyArm.in").setInput(89.1);
io("wb.fuel.gal").setInput(108); io("wb.front.lbs").setInput(700); io("wb.rear.lbs").setInput(400); io("wb.baggage.lbs").setInput(200);
io("wb.burn.gal").setInput(0); io("wb.taxi.gal").setInput(0);
ctl.change();
ok("overweight load produces a warning", /(&gt;|>|over)/i.test(String(io("wb.status").val())));
ok("TO status badge not OK when overweight", /(OVER WT|CG)/.test(String(io("wb.TOstatus").val())));

/* =========================================================================
 * L. (#5,#6) Home dashboard summarizes results + acName reflects profile
 * =======================================================================*/
io("ac.emptyWeight.lbs").setInput(2460); io("ac.emptyArm.in").setInput(89.1);
io("wb.front.lbs").setInput(340); io("wb.rear.lbs").setInput(170); io("wb.baggage.lbs").setInput(50);
io("wb.fuel.gal").setInput(90); io("wb.burn.gal").setInput(30); io("wb.taxi.gal").setInput(2.7);
io("ac.reg").setInput("N123AB"); ctl.change();
ctl.current("home"); view.render();
var homeHTML = view.mount.innerHTML;
ok("home shows aircraft registration", homeHTML.indexOf("N123AB") >= 0);
ok("home summarizes a takeoff distance", /takeoff/i.test(homeHTML));
ok("home references weight & balance", /(weight|balance|CG)/i.test(homeHTML));
io("ac.reg").setInput(""); ctl.change(); ctl.current("home"); view.render();
ok("home flags Default aircraft when no reg", view.mount.innerHTML.indexOf("Default aircraft") >= 0);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
