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
- Total cruise fuel flow is computed as per-engine x2 (e.g. 75% -> 11.7 x2 =
  23.4 gph); the POH's printed total-fuel box rounds 75% to 23.3 — a 0.1 gph
  rounding difference.
