# Pi Toolbox Parity: Implementation Plan

Source: `Dawg_Viewer_Feature_Reference.md` (the `pi-toolbox-analysis` branch, 18 commits, ~14,900 lines).
This plan covers how to bring each of those features into the current `dev` branch, one at a time.

> **Superseded layout phase:** Phase 0's row-layout proposal was implemented and
> later removed. The app now keeps the bento panel model and offers the original
> full-size layout as the default through Settings. Treat the row-layout details
> below as historical context, not current implementation guidance.

## 0. Where `dev` is today

`dev` is a much smaller app than the reference branch. It has:

| Area | Current state |
|---|---|
| Viewer | One list of plot panels (`state/layout.ts`), channel list, status bar. Time plots only (uPlot via `plot/mountPlot.ts`). |
| Layout | A "bento" grid: `colSpan` 1-2, `rowSpan` 1-4, `widthPct`, `height`, `slot {row, col}`, drag-to-place (`state/plotSlots.ts`, `components/PlotStack.tsx`), edge/corner resize in `PlotPanel.tsx` and `live/LivePlotPanel.tsx`. |
| Live | Live plots, pinned cards, status header, store (`live/*`). |
| Logs | Logs tab, `openLog.ts`. |
| Backend | `services/live.go`, `services/logs.go`, `internal/{calib,config,live,logfile,...}`. Calibration is linear / steinhart / gear only. |
| Missing entirely | Worksheets, panel kinds (XY, histogram, map, spectrum, launch, aero), derived channels, GPS/laps, math channels, filters, car specs, channel editor, sensor map, setups, test mode, live-in-viewer. |

The reference doc describes features as they were built *on a different base*. We should reuse its algorithms and constants but write the code against `dev`'s structure, one feature per branch and PR-sized commit.

Repo conventions to keep (from the reference): no code comments, prettier + tailwind plugin, eslint (react-hooks), tests for every new `analysis/*` and `state/*` module, docs in `docs/` updated per feature.

---

## 1. Ground rules for every phase

1. **One feature per branch off `dev`** (`feature/<name>`), merged before the next starts. Each phase below is one branch.
2. **Pure logic first.** Put maths in `frontend/src/analysis/*.ts` with vitest tests before any UI. The reference's tests and constants (section 6.5 of the reference) are the acceptance targets.
3. **Persistence:** browser-storage keys use the `dawg.` prefix, validated on read, falling back to defaults (`state/storage.ts` `persisted` helper, built in Phase 1).
4. **Perf rules from the start** (reference 5.2/5.3): canvases and uPlot instances pause when off-screen; heavy results (envelopes, bands) are reused while zooming and recomputed 160 ms after the range settles.
5. **Each phase ends with:** `npm run test`, `lint`, `typecheck`, `format:check`, and a manual check in the running app with the sample log.

---

## 2. Phase 0: Replace the bento grid with simple stacked rows (do first)

### Goal

Remove scalable/snapping plot sizes. Plots only **stack one by one** or sit **side by side**. Size changes are **vertical only, continuous, no snapping**. A side-by-side pair moves up/down as one unit.

### New layout model

Replace the 2-column slot grid with an ordered list of **rows**. A row holds either one full-width panel or two half-width panels.

```ts
interface Panel { id: number; channelIds: string[] }
interface Row { id: number; panelIds: [number] | [number, number]; height: number }
interface Layout { panels: Panel[]; rows: Row[]; activeId: number; nextId: number; nextRowId: number }
```

- `height` is a free pixel value on the **row**, so both plots of a pair always share it. Min 120 px, max 1200 px, default 192 px (`DEFAULT_ROW_HEIGHT`).
- No `colSpan`, `rowSpan`, `widthPct`, `slot`, or `BentoSpan/BentoRowSpan` anywhere.
- Width is never user-set: one panel in a row = full width, two = 50/50.

### Behaviour

| Interaction | Result |
|---|---|
| Add plot | Appends a new full-width row. |
| Drag a plot's header onto the **top / bottom edge** of another row | Plot becomes its own full-width row above / below that row. |
| Drag a plot onto the **left / right half** of a row that has one plot | Row becomes a pair (dragged plot on that side). |
| Drag a plot onto a **full pair** | Swaps with the plot under the pointer. |
| Drag the row's **grip handle** (new, at the pair's outer edge) | Moves the **whole row** (single or pair) up/down. |
| Drag the **bottom edge** of a plot | Changes the row height continuously by pixels. Pair shares it. No row-span steps, no snapping. |
| Remove a plot from a pair | Remaining plot becomes a full-width row (keeps the row height). |
| Remove the last plot | Row stays with an empty plot (same as today). |
| Split / join buttons | "Put beside previous plot" / "Put on its own row" in the plot header menu, as a keyboard-friendly alternative to dragging. |

Horizontal edge handles (left/right) and the corner handle are **removed**. The `togglePanelWidth` / `togglePanelHeight` buttons are replaced by split/join.

### Code changes

| File | Change |
|---|---|
| `state/layout.ts` | Delete `BentoSpan`, `BentoRowSpan`, `SnapZone`, `computeEdgeResize`, `detectSnapZone`, `panelColSpan/WidthPct/RowSpan/HeightPx`, `movePanels` snap logic, `resizePanel`, `togglePanelWidth/Height`, `placePanel`. Add `Row`, `rows` in `Layout`, and reducer actions: `addPanel`, `removePanel`, `dropPanel {panelId, targetPanelId, zone: 'top'\|'bottom'\|'left'\|'right'\|'swap'}`, `moveRow {rowId, toIndex}`, `setRowHeight {rowId, height}`, `splitPanel`, `joinPanel`. |
| `state/plotSlots.ts` | Delete (the slot/overlap solver is no longer needed). |
| `state/layout.ts` `loadPlotLayout` / `savePlotLayout` | New storage key `dawg.live-plots.v2`. **Migrate** v1 by ordering panels by `(slot.row, slot.col)`, pairing neighbours that were both half-width on the same row, and using the largest `height` of a pair. Anything invalid falls back to default. |
| `components/PlotStack.tsx` | Render rows (flex column; a row is `flex gap-1.5` with 1-2 children, fixed `height`). Drag-over computes the drop zone from the pointer position inside the hovered panel (edge bands of 25%, centre = swap), shows a thin insertion line / half highlight instead of the current phantom-slot preview. |
| `components/PlotPanel.tsx`, `live/LivePlotPanel.tsx` | Remove left/right/corner handles and `startEdgeResize` width logic. Keep one bottom handle that dispatches `setRowHeight` (update the DOM height during drag, commit on pointer up, to avoid re-rendering every move). Add row grip + split/join control. These two files duplicate the logic today; extract a shared `usePlotResize` / `RowFrame` so Phase 0 fixes both once. |
| `ui.ts` | Remove `ROW_SPAN_CLASSES`, `bentoPanelClass` width/row classes, `panelWidthStyle`. |
| `views/ViewerView.tsx`, `views/LiveView.tsx` | Use the new `Layout` factory (`makeLayout` builds one row per panel). |
| Tests | Rewrite `state/layout.test.ts` and `components/PlotStack.test.tsx` for rows: add/remove, drop zones, pair moves as a unit, shared height, v1 migration, bounds on height. |

### Done when

- No plot can be resized horizontally or snapped; vertical resize is smooth and per pixel.
- A pair drags and resizes as one.
- Old saved layouts load without errors.
- All tests, lint and typecheck pass.

This phase should land before anything else, because every later panel kind (XY, map, spectrum...) plugs into the same row frame.

---

## 3. Phase order and dependencies

```
Phase 0  Row layout
   |
Phase 1  Foundations: storage helper, worksheets, panel kinds, shared frame
   |-- Phase 2  Derived channels, GPS/distance, laps
   |       |-- Phase 3  Lap modes, overlays/time slip
   |       |-- Phase 7  Launch, aero, compare runs (need car + laps)
   |-- Phase 4  Math channels + side panel (Stats/Values)
   |       |-- Phase 5  Spectrum + filters
   |-- Phase 6  Extra panels: XY/G-G, histogram, track map
Phase 8  Car specs + channel editor + calibrations + groups (Go + UI)
Phase 9  Sensor map + editor
Phase 10 Live: logger clock, live-in-viewer, live map, test mode
Phase 11 Setups, export/import, startup choice
Phase 12 Polish: slide bar, zoom buttons, spike-proof axes, branding
```

Some items from section 12 are cheap and visible, so they can be pulled forward at any time (zoom buttons, slide bar). Phase 8 (Go backend) is independent of the viewer analysis and can run in parallel by a second person.

---

## 4. Feature phases

Reference section numbers are in brackets. Each phase lists: **Build**, **Depends on**, **Tests**, **Risk**.

### Phase 1: Foundations [2.1, 2.12 groundwork, 6.1]

**Build**
- `state/storage.ts`: `persisted(key, fallback, validate)`, `download`, `pickTextFile`, try/catch around every storage access.
- `state/workbook.ts`: worksheets (add/rename/duplicate/delete/move/replace), `WorksheetTabs.tsx` along the bottom, `dawg.workbook.v1`.
- `Panel` gets a `kind` (`time` first; others added by later phases) plus per-kind options. Row layout from Phase 0 is **per worksheet**.
- Shared `PanelFrame.tsx` (header, close, split/join, row grip, bottom resize) used by every kind, replacing the duplicate `PlotPanel`/`LivePlotPanel` shells.
- Add-panel menu in the Viewer toolbar (just Plot for now).
- `defaultWorkbook(channelNames, hasGps)` premade sheets (Driver, Engine, Chassis, Vibration, Launch, Aero, Overview), only referencing channels the log has; missing channels shown, not fatal.

**Depends on:** Phase 0. **Tests:** `workbook.test.ts`, `layout.test.ts` (premade sheets, fallback sheet, sheet management). **Risk:** the biggest refactor of `ViewerView`; keep the Live tab working throughout.

### Phase 2: Derived channels, GPS, distance, lap timing [2.2, 2.3, 2.4]

**Build**
- `analysis/track.ts`: `findGps` (>=10 real fixes, ignore 0,0), `smoothFixes` (+/-0.25 s), haversine `cumulativeDistance` (R=6,371,008.8 m, skip >120 m/s jumps), speed-integrated distance, `guessSpeedUnit`, `findSpeed`.
- `beaconCrossings` (closest sample per visit, min-lap rule), `buildLaps` (Out / numbered / In).
- `viewer/analysis.ts` `useAnalysis(session)` as staged `useMemo`s: channel meta, GPS, distance, laps, Analysis-group channels (`Distance`, `Lap Number`, `Lap Time`, `Lap Distance`).
- Sidebar **Laps** tab (start with beacon, gate radius, min lap, distance source), lap markers on time plots.
- Stores: `dawg.track.v2`, `dawg.splits.v1`.

**Depends on:** Phase 1. **Tests:** port `track.test.ts` cases (Earth distance, GPS detection, beacon laps, speed distance, lap format). **Risk:** `Session` type in `data/session.ts` must accept derived channels without mutating the raw log.

### Phase 3: Lap modes and overlays [2.5, 2.6, 3.13]

**Build**
- `buildRuns`, `pairGates`, `runEnd`; lap modes `loop` / `gates` / `launch` / `manual` with the empty-state messages; `validTrack` validation.
- `analysis/overlay.ts` (<=5,000-point distance grid, stretch-to-reference), `viewer/xview.ts` (`XView` hides time vs distance), time-slip channel.
- `analysis/fusion.ts` GPS gap filling (dead reckoning pinned to fixes) and its report line.
- The `launch` mode needs Phase 7's launch detection; ship the other three first and add `launch` when Phase 7 lands.

**Depends on:** Phase 2. **Tests:** `track.test.ts` (gate pairing, run ends, run numbering, overlay/time slip, dropout rebuild). **Risk:** the XView abstraction touches every panel; do it before adding more panel kinds.

### Phase 4: Math channels and side panel [2.7, 2.8]

**Build**
- `analysis/math.ts`: recursive-descent parser, column-wise evaluator, constants, time-series functions (`deriv`, `integ`, `smooth`, `delay`), `computeAll` with dependency order and per-channel errors. Full function list in reference 6.4 (filters come in Phase 5).
- `MathEditor.tsx`, `dawg.math.v1`, defaults (Combined G, Brake Bias, Steer Rate).
- Sidebar **Stats** (min/avg/max in view, per lap when overlaying, one update per animation frame) and **Values** (cursor values written straight to the DOM).
- Channel delete (trash) for made channels [4.8 part].

**Depends on:** Phase 2 (for `t`, time column, groups). **Tests:** port `math.test.ts`, `stats.test.ts`. **Risk:** 700k-row logs, so keep constants as scalars until they meet a column.

### Phase 5: Spectrum and filters [3.1-3.6]

**Build (in this order, each shippable)**
1. `analysis/spectrum.ts`: `uniform`, `welch`, radix-2 `fft`, `peak`, `toDb`; `SpectrumPanel.tsx` with window size and channel picker.
2. Filters: `biquad` (zero-phase Butterworth, bilinear), `lowpass`/`highpass`/`bandpass`/`bandstop` with steepness 1-4 and `stageSpread`; add to math functions.
3. `shape()` FFT-domain filter and `shapeGain`.
4. `FilterDialog.tsx` + `analysis/filters.ts` (`filterExpr`, `filterName`, `checkFilter`, `parseFilter`); multi-channel filtering; edit existing filter.
5. EQ-style graph (draggable dots, before/after spectra, `startingPoints`, `filterGain`).

**Depends on:** Phase 4. **Tests:** `spectrum.test.ts`, `filters.test.ts`, filter cases in `math.test.ts`. **Risk:** the EQ editor is the largest single component; ship steps 1-4 before it.

### Phase 6: XY / G-G, histogram, track map panels [2.9, 3.7, 3.8]

**Build**
- `plot/canvas.ts` `mountCanvas` (base + cursor layers, one repaint per frame, off-screen pause).
- `XYPanel` (<=40,000 points, swap axes), `analysis/gg.ts` envelope (36 directions, 98th percentile, equal-area circle), G-G legend.
- `HistogramPanel` (10-160 bins, shared bin range across laps), `analysis/stats.ts` `histogram`, `niceTicks`.
- `TrackMapPanel` + `plot/trackMap.ts` (equirectangular projection, 24 colour-bucket paths, click to set start/finish).

**Depends on:** Phases 1-3 (XView). **Tests:** `stats.test.ts`, G-G tests. **Risk:** low; these are independent panels.

### Phase 7: Launch, aero, compare runs [3.9-3.12]

**Build**
- Car data module `data/car.ts` (`DEFAULT_CAR`, `withDefaults`, `tractionLimitG`, `speedAt`). Needs Phase 8's Car tab to be editable; read-only defaults are enough to start.
- `analysis/launch.ts` (`findLaunches`, `measureLaunch`, `accelSign`, `slipAt`, `wheelSpeedFromRpm`, `manualLaunch`), `LaunchPanel`, manual launch marks (`dawg.launchMarks.v1`).
- `analysis/aero.ts` (`gripBySpeed`, `fitAero`, `MIN_FIT_SPREAD`), `AeroPanel`.
- `state/references.ts` + `CompareControls` (save/compare G-G and aero results).
- Hook launch detection into lap mode `launch`.

**Depends on:** Phases 3, 6, 8 (car specs). **Tests:** `launch.test.ts`, `aero.test.ts`, `references.test.ts`. **Risk:** thresholds are tuned to the sample log; keep the sample log and the simulator (Phase 10) handy for checking.

### Phase 8: Car specs, channel editor, calibrations, groups (Go + UI) [4.1-4.5, 4.8, 4.9]

**Build**
- Go: `internal/config/edit.go` (`SaveChannel`, `SaveCar`: text-based YAML edits that preserve comments, strict-load check, atomic write), `Car` struct and `Info.{channels,calibrations,car}`, `calib.Poly`, `calib.Table`, `FitPoly`, `Converter()` for `poly`/`table`, `Session.SetCalibrations`, `LiveService.SaveChannel/SaveCar`. Regenerate bindings.
- TS: `data/calibration.ts` (`polyFit`, `tableFn`, `inverter`), `CalGraph`, `ChannelEditor`, Car tab (`CarView`), `data/groups.ts` + grouped `ChannelList`, `recalibrate` for an open log.
- Reset-to-defaults in the editor.

**Depends on:** none from the viewer side (can run in parallel with Phases 2-6). **Tests:** `calib_test.go`, `edit_test.go`, `calibration.test.ts`. **Risk:** highest backend risk, because it writes to the team's device profile YAML; keep the "nothing is saved if it would not load" guard and test against the shipped profiles.

### Phase 9: Sensor map and editor [4.6, 4.7]

**Build:** `data/sensors.ts` (`SPOTS`, `defaultSpot`, `sensorPos`, hover observable), `CarDiagram.tsx` SVG, `SensorEditor.tsx` drag-to-place saved through `SaveChannel` (`channels.<name>.pos`).

**Depends on:** Phase 8. **Tests:** `sensors.test.ts`. **Risk:** low.

### Phase 10: Live additions [5.1, 5.2, 5.4, 5.5, 5.6]

**Build (independent items)**
- Logger-clock timing in Go (`internal/live/timebase.go`: min-offset tracking, 200 us/s drift cap, 120 ms hold-back reorder, `RX_DELAY`, status `timing`/`lateRows`) and the status bar readout. Can start any time.
- `onLiveFrame` gating (draw only when the Live tab is shown, once per animation frame).
- Live track map with lap timer (`live/LiveMap.tsx`, shares the Phase 2 beacon).
- Live data in the Viewer: `liveSession()` snapshot every 1 s, follow mode, "Watch live data".
- Test mode: `testmode/sim.ts` simulated car and `testMode.ts` driver; a sample outing for the Viewer.

**Depends on:** timing: none; Viewer live: Phases 1-4; test mode: pairs well with 7. **Tests:** `timebase_test.go`, `connection.test.ts`. **Risk:** test mode is large (the simulator); do it last in this phase, but it makes verifying Phases 5-7 much easier, so consider pulling it earlier.

### Phase 11: Setups, export/import, startup choice [2.12, 5.7]

**Build:** `state/setup.ts` (`currentSetup`, `applySetup`, `freshSetup`, `lastLog`, `askOnStart`), Export/Import setup JSON, `SetupsDialog`, startup "Welcome back" dialog, Go `services/presets.go` (name cleaning, 4 MiB cap, atomic write, path-escape guard).

**Depends on:** all stores that a setup includes (so best after Phases 1-7). **Tests:** `TestPresets`. **Risk:** each included store must validate on apply so a bad file cannot corrupt state.

### Phase 12: Polish [2.10, 2.11, 5.3, 5.8]

**Build:** slide bar `RangeBar.tsx`, -/+ zoom buttons, spike-proof y axes (`spikeFreeExtent`, wheel zoom/pan on axes, `fullY`), team logo and bulldog in the header, scrolling-panel behaviour check (note: with Phase 0 the page scrolls vertically over rows of fixed height, which replaces the reference's 17rem grid rule).

**Depends on:** Phase 1. **Tests:** small. **Risk:** low; pull forward any time.

---

## 5. Known divergences from the reference doc

1. **Layout:** reference 5.3 describes a two-column grid with `minmax(17rem,1fr)` rows and a double-height Launch panel. We use Phase 0 rows with free vertical height instead; the Launch/Aero panels get a larger **default** row height (e.g. 384 px), not a row span.
2. **Panel width:** reference panels have a `wide` flag. Here, width is decided only by whether a row holds one or two panels.
3. **Out-of-date text in the reference:** the setup dialog hint says "Setups... at the bottom of the Viewer"; the button is in the top bar. Write the correct wording from the start.
4. **Commit authorship / patch delivery** in reference section 8 does not apply; we use normal feature branches into `dev`.
5. The reference was built against a Linux dev environment (`CGO_ENABLED=0 go test -tags server`). On this Windows machine, run Go tests the usual way and confirm the build task still works after Go changes.

## 6. Open questions to settle before the relevant phase

| # | Question | Needed by |
|---|---|---|
| 1 | Does the current Live tab keep its own plot layout (`dawg.live-plots`) separate from Viewer worksheets, or should it become a worksheet too? | Phase 0/1 |
| 2 | In Phase 0, should dropping onto the middle of a plot **swap** plots, or do nothing? (Plan assumes swap.) | Phase 0 |
| 3 | Do we want the reference's exact premade sheet names and contents, or a trimmed set for our channel names? | Phase 1 |
| 4 | Is the team's sample log (`SAMPLE_synthetic_outing.csv`) available in this repo or must it be copied from the zip? | Phase 2 |
| 5 | Should Phase 8 (Go) go to a second person so it runs in parallel with the viewer phases? | Phase 8 |

## 7. Suggested order of work

1. **Phase 0** (row layout), as requested.
2. Phase 1, then 2, 3, 4 (the core Pi Toolbox loop: sheets, laps, math).
3. Phase 6 (XY / histogram / map), then 5 (spectrum, filters).
4. Phase 8 in parallel if there is a second developer, then 7, 9.
5. Phase 10, 11, 12.
