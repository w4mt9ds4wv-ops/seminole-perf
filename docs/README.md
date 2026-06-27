# PA-44-180 Seminole Performance — offline PWA

A reference/planning performance calculator for the Piper PA-44-180 Seminole.
100% client-side, offline-first, installable as a PWA on iOS Safari and runnable
straight from `file://` on a Mac. No APIs, no CDNs, no external fonts/scripts, no
analytics, no cloud sync — every byte ships in the bundle.

All performance data is taken **only** from the official PA-44-180 POH
("VB-1616", issued 1995-07-12, rev 2002-07-23). No data from any other aircraft
(including the PA-28) is used. The attached reference screenshots informed the
**layout and workflow only**, never the numbers.

> Reference/planning use only. Not a substitute for the approved POH, official
> charts, or a current weight-and-balance record. Verify every value before
> flight.

## Architecture (MVC framework)

Clean-room implementation of documented MVC conventions in original code:

- **State (`stateInfo`)** — every input/output is an id `page.name.unit`
  (e.g. `wb.fuel.gal`), read/written via `io(id).val()`. Invalid sentinels
  (`INVALID_NULL` / `INVALID_INPUT` / `INVALID_POH`) propagate through arithmetic
  and render as "—" / "check input" / "POH".
- **POH tables -> `Ptable`** — recursive multi-axis interpolation with
  `parmLimits` clamping and `PtableError` for out-of-envelope inputs.
- **Distance charts -> separable models** — `cal x baseline(densityAlt) x
  weightMult x windMult`, each pinned to the chart's verified example anchor,
  with no-extrapolation guards.
- **CG -> `CGenvelope`/`CGpoint`** — exact Section-6 arms; forward-piecewise /
  aft-constant (93.0) envelope drawn as an inline SVG.
- **View (`viewTemplate`)** — pages are JSON trees (`page`->`cols`/`group`->`row`,
  `panel`, `dash`); `{{id}}` references bind to state; the active page re-renders
  on every change.
- **Controller (`computeInfo`)** — each page declares `{inputs, outputs, fn}`;
  the controller clears outputs and reruns compute twice so cross-page values
  (e.g. W&B -> Departure/Destination weights) settle.

## Pages (pilot workflow)

`Flight Performance` (home dashboard) · `Aircraft` (profile manager) ·
`Weight & Balance` · `Departure` · `Enroute` (cruise) · `Destination` ·
`Climb` · `Reference`.

Sub-pages use the split **Settings | Results** layout from the screenshots;
results are blue, warnings/"Default aircraft" are red. The home dashboard shows
four summary panels (W&B with CG diagram, Departure, Enroute, Destination) each
linking to its page.

## Key features

- **Aircraft profile manager** (`Aircraft` page) — registration, basic empty
  weight, empty-weight arm; save / load / edit / delete to `localStorage`
  (no cloud). The last-used profile is remembered and reloaded on start. A
  loaded profile's empty weight + arm port automatically into Weight & Balance.
- **Weight & Balance loading bar** — alongside the CG envelope, a proportional
  stacked bar shows fuel in blue (with gallons and pounds) and payload/load in
  green (pounds); both segments resize live as fuel, occupants and baggage
  change. Takeoff (blue) and landing (green) CG points are plotted on the
  envelope with offset, non-overlapping labels.
- **Departure / Destination** — simplified to the inputs the POH actually
  supports: field elevation, wind, OAT, altimeter, runway and length, plus a
  manual ground-roll adjustment %. (Slope, surface, condition, flaps and the
  airport field were removed — this POH publishes no slope/surface/condition
  correction.) A **"Use departure settings"** toggle on the Destination page
  copies altitude, wind, OAT, altimeter, runway and TORA from Departure; turn it
  off to enter the destination independently.
- **Ceilings (Enroute)** — two-engine and one-engine **service** (50 fpm) and
  **absolute** (0 fpm) ceilings, derived by working backwards along the
  digitized climb-rate lines and extrapolating to the target rates.
- **Cruise power setting** (`Enroute`) — manifold pressure + RPM from the POH
  "Fuel & Power Setting Table" (Fig 5-23), with pressure-altitude interpolation,
  ~1%-MP-per-8C temperature correction, full-throttle ("FT") detection, plus
  fuel flow, TAS, fuel-to-destination, ETE, reserve check and range.
- **Dynamic runway + wind graphic** (`Departure`/`Destination`) — an SVG runway
  oriented to the entered runway number with a colored wind arrow (green =
  headwind, red = tailwind) and a text readout of head/tail and left/right
  crosswind components that update live with runway, wind direction and speed.
- **Full POH temperature range** — no 15C floor. Cold temperatures compute via
  density altitude; OAT outside the chart range (-40...+50C) is rejected with a
  clear out-of-range warning rather than silently clamped or extrapolated.

## Offline / PWA

`service-worker.js` precaches the full asset list (same-origin only; it never
issues a cross-origin request) and serves cache-first with an `offline.html`
fallback. `manifest.webmanifest` + bundled icons make it installable.

The layout is responsive and tuned for **Mac, iPhone and iPad**:

- The Settings | Results split sits side-by-side on Mac and iPad and stacks to a
  single column on iPhone (and iPhone portrait); the home dashboard flows from
  four columns down to two then one as width shrinks.
- iOS specifics handled: `100dvh` sizing (avoids the Safari address-bar cutoff),
  16 px form controls (stops Safari's focus-zoom), larger touch targets on
  touch devices, and safe-area insets so the header sits correctly behind the
  status bar and the footer clears the home indicator on notched iPhones.

### Installing

- **iPhone / iPad (Safari):** open the page, tap the Share button, choose **Add
  to Home Screen**. It then launches full-screen and runs offline.
- **Mac:** open `index.html` directly, or serve it (below) and use it in Safari
  or Chrome. In Chrome you can also Install it as an app from the address-bar
  icon.

## Local testing

- **Quick (file://):** double-click `index.html`. All calculators and graphics
  work. (The service worker won't register under `file://`; that's expected.)
- **Full PWA / offline:** serve over http, e.g. `python3 -m http.server` in this
  folder, open `http://localhost:8000/`, then toggle the network off to confirm
  it still loads and computes.
- **Automated checks:** `node tests/run-node.js` runs the integration suite
  (POH-value regression, profile CRUD, cruise MP/RPM, wind components,
  sub-15C, out-of-range warnings, per-page render, home summary).

## Data provenance & limitations

- Printed/verified directly from the POH: V-speeds and ASI markings (Section 2),
  weights/arms/CG envelope and fuel (Sections 1/6), cruise fuel flow and the
  cruise MP/RPM "Fuel & Power Setting Table" Fig 5-23 (Section 5), and the
  speed-by-weight Vr/obstacle/approach values.
- **Digitized** from the Section-5 graphical nomographs (flagged internally
  `verified:false`, pending an independent re-read): takeoff/landing ground-roll
  and 50-ft-obstacle distances, accelerate-stop, climb rate, and cruise TAS.
- Not provided by this POH (and therefore intentionally absent): runway
  slope/surface numeric corrections, single-engine service ceiling, best
  single-engine glide, go-around distance, and a dedicated descent-rate chart.
  Magnetic variation is not applied (offline, no airport database).
- Service/absolute ceilings are **derived**, not printed: the digitized climb
  line is inverted and extrapolated past the charted altitudes to find the 50/0
  fpm crossing. The two-engine result (~18,000 ft) is consistent with the
  published figure; the one-engine result depends directly on the unverified
  digitized single-engine climb numbers and should be treated as DERIVED·VERIFY.
- Total cruise fuel flow is computed as per-engine x2 (e.g. 75% -> 11.7 x2 =
  23.4 gph); the POH's printed total-fuel box rounds 75% to 23.3 — a 0.1 gph
  rounding difference.
