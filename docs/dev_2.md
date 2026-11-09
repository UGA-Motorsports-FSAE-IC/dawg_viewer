# `dev-2` implementation plan

## Branch convention

- `dev-2` is the implementation baseline and the branch on which changes are made.
- `dev` is reference-only. Features may be studied and selectively ported from it, but
  `dev-2` architecture, behavior, and existing features take precedence.
- Do not replace `dev-2` files wholesale with their `dev` equivalents. Integrate each feature
  into the current `dev-2` application and preserve its Car tab, setups, test mode, live-log
  watching, analysis tools, and backend integration.

## Settings layout

### Goal

Add a Settings destination to the existing top navigation. Its visual structure should follow
the ChatGPT Settings pattern, adjusted to the Dawg Viewer theme:

- no settings sidebar;
- one centered, vertically scrolling content column;
- a clear page title followed by vertically stacked sections;
- section headings and optional descriptions above their content;
- settings represented as full-width rows within a section;
- subtle dividers between rows instead of a grid of large cards;
- responsive spacing and width so the same structure works in narrow windows;
- room to add controls without restructuring the page.

The initial implementation intentionally contains no settings. It establishes the page,
layout primitives, navigation, and empty-state behavior only.

### Initial page structure

```text
Settings

No settings are available yet.
Future application preferences will appear here.
```

The empty state should live inside the same centered content column future sections will use.
It should not look like an error or a disabled control.

### Component design

Create `frontend/src/views/SettingsView.tsx` as a small page shell with an API that can grow
without moving settings state into the component prematurely.

Recommended structure:

```tsx
<SettingsView>
  <SettingsSection title="..." description="...">
    <SettingsRow label="..." description="...">
      {/* control */}
    </SettingsRow>
  </SettingsSection>
</SettingsView>
```

For the empty first version, only `SettingsView` needs to render. Add `SettingsSection` and
`SettingsRow` when the first real setting is introduced, or add them now as private helpers if
doing so keeps the markup simple. Do not create a settings store until a setting needs one.

Future row behavior should support:

- labels and secondary explanatory text;
- right-aligned toggles, selects, buttons, or compact custom controls;
- rows that stack their control below the label on narrow screens;
- keyboard focus states and accessible labels;
- optional destructive or warning styling without changing the base layout.

### Integration steps

1. Extend the `Tab` type and `TABS` collection in `frontend/src/App.tsx` with `settings` /
   `Settings` while preserving Live, Logs, Viewer, and Car.
2. Import and render `SettingsView` using the same `min-h-0 flex-1` content boundary as the
   existing destinations.
3. Keep existing right-side navigation actions—Setups, test-mode state/action, and version—
   unchanged.
4. Give the Settings page its own vertical scrolling container. Keep root-level scrolling
   disabled so the application shell remains fixed.
5. Use a centered column around `max-w-2xl` to `max-w-3xl`, with comfortable horizontal and
   vertical padding. Use the current zinc/red design tokens rather than introducing a second
   theme.
6. Render the neutral empty-state copy. Do not port `PlotLayoutMode`, local-storage keys, or
   plot-layout controls from `dev` in this phase.
7. Add navigation coverage to `frontend/src/App.test.tsx`: opening Settings shows its heading
   and empty state, and returning to Live still preserves the existing mounted Live view
   behavior.
8. Add a focused `SettingsView` test only if reusable section/row components are introduced;
   otherwise the App navigation test is sufficient for the empty shell.

### Planned file changes

| File | Initial change |
|---|---|
| `frontend/src/App.tsx` | Add the Settings tab and render the page without disturbing current `dev-2` controls. |
| `frontend/src/views/SettingsView.tsx` | Add the scrollable, centered, sidebar-free empty Settings layout. |
| `frontend/src/App.test.tsx` | Cover Settings navigation and the empty state. |
| `docs/frontend.md` | Briefly document where application-wide preferences will live. |

### Explicit non-goals for the first implementation

- No plot-layout selector.
- No bento/full-size state or behavior.
- No persistence key or settings storage abstraction.
- No migration of existing layout, workbook, card, channel, or setup preferences.
- No sidebar, category tabs, search, modal, or nested settings routes.
- No changes to Live, Viewer, Car, Logs, setups, test mode, or backend services.

### Acceptance criteria

- Settings appears as a top-level tab after Car.
- Opening it displays a Settings heading and neutral empty-state message.
- The page contains no interactive setting controls.
- The content is a centered vertical layout with no sidebar.
- The page scrolls internally when future content exceeds the viewport.
- Existing navigation actions and views continue to work unchanged.
- Frontend tests, typecheck, lint, and formatting checks pass.

## Part 2: Live bento layout

Implementation status: the Settings choice, Live-only compact grid, width/height controls,
track-map hosting, ordered conversion, and frontend tests are implemented on `dev-2`.

### Scope and defaults

Add bento as an optional layout for the Live tab only.

- The current vertically stacked Live layout is the default and is called `default` in state and
  tests.
- Bento can be enabled only from the Settings page. Do not add a Live toolbar shortcut or an
  implicit screen-size switch.
- The selected mode is saved under a new versioned local-storage key. Missing, invalid, or
  inaccessible storage resolves to `default`.
- Viewer keeps its current worksheet grid and receives no bento mode prop, bento state, layout
  conversion, or Settings behavior.
- Switching modes must not remove panels, channels, active-panel state, graph-specific state, or
  the saved bento width and height choices.

### Settings integration

Replace the Settings empty state with the first vertical section:

```text
Settings

Live view
Plot layout                                      [Default v]
Choose how graphs are arranged in the Live tab.
```

Use a compact select or two-option segmented control with `Default` and `Bento`. The row should
follow the section/row structure planned in Part 1, with the label and description on the left
and the control on the right. The control must be labelled for keyboard and screen-reader use.

`App` owns the setting and passes it only to `LiveView`. Loading and saving should live in a
small module such as `frontend/src/settings/liveLayout.ts`; `SettingsView` should remain a
controlled view.

### Bento visual model

Use a two-column grid with short and tall row sizes. Every bento item has two independent,
persisted-in-session choices:

- width: half or full;
- height: short or tall.

Keep the existing header buttons for changing width and height. A full-width item spans both
columns. A tall item spans two rows. New graph panels default to half width and short height in
bento, while their default-mode presentation remains the current full-width flexible panel.

The bento surface should read as one continuous graph workspace:

- use a one-pixel divider between neighboring items, matching the current Live stack;
- remove the padded outer gutter, six-pixel card gap, rounded card margins, and exposed grey
  cells from the `dev` implementation;
- keep the active graph's red left border or equivalent focus indicator;
- ensure each graph has `min-width: 0` and clips its own drawing surface rather than widening the
  application.

### Dense placement with no blank cells

Do not port the persisted arbitrary `row` and `column` slot model from `dev`. Store logical item
order plus width and height, then derive positions.

Create a pure packing function that scans available cells in this order:

1. top row to bottom row;
2. left column to right column within each row;
3. first position where the item's width and height fit.

After adding, removing, resizing, or reordering an item, repack the entire list. Later half-width
items may fill an earlier opening left by a tall or full-width item. Users cannot drop a graph
into arbitrary empty coordinates, so empty rows cannot be preserved accidentally.

The packer's output contains derived `{ row, column, columnSpan, rowSpan }` values. It is render
state, not stored layout state. Use stable item IDs and original list position as tie breakers.

### Reordering and mode conversion

Drag and drop changes logical order and immediately reruns dense packing. The preview should show
an insertion point in the ordered item list rather than writing a free-form grid coordinate.
Cancelling a drag leaves order and sizing unchanged.

Mode transitions follow these rules:

- **Default to bento:** start with the current default panel order. Pack the first panel at the
  upper left, the second at the upper right when both are half width, then continue left to right
  and top to bottom. Reuse bento width and height values already held for each item.
- **Bento to default:** sort the currently packed plot panels by row, then column. Use the prior
  logical index and stable ID only to break ties. Write that sequence back to `layout.panels`, so
  the default vertical stack follows the last visible bento order.
- Width and height affect bento only. Returning to default does not create short, side-by-side, or
  fixed-height panels.
- Switching back to bento restores each graph's last width and height while starting from the
  current default panel sequence.

This conversion must occur in one reducer action or one state transaction so there is no render
where active IDs or channel selection point at a reordered intermediate layout.

### Live graph coverage

The bento renderer must accept every visualization currently rendered by Live:

- every time-series `LivePlotPanel`, including empty panels, waiting-for-device panels,
  multi-stream panels, and panels using spike-resistant scaling;
- the optional live track map with its lap timing, beacon selection, zoom, and pan behavior.

Pinned value cards, the channel list, status header, time-window toolbar, and range bar are Live
controls rather than graph items and remain outside the bento grid.

Introduce a shared Live graph item type so bento layout does not depend on the internals of a
time-series panel. For example:

```ts
type LiveGraphItem =
  | { type: 'plot'; id: `plot:${number}`; panelId: number }
  | { type: 'trackMap'; id: 'track-map' }
```

In default mode the track map keeps its current right-side dock. In bento mode, when visible, it
is rendered through a bento frame and participates in ordering and width/height controls. Refactor
`LiveMap` so its graph body and controls can be hosted in either presentation without mounting two
maps or duplicating lap subscriptions.

The item/renderer boundary should allow later Live graph types to opt into bento by registering a
stable ID and renderer, without changing the packing algorithm.

### Scrolling design

Avoid the `dev` combination of absolute positioning, a calculated pixel-height spacer, and a
nested scrolling wrapper. That structure can create surplus scroll range, jumping scrollbars,
and confusing drag coordinates.

Use these constraints:

- the graph area has exactly one vertical scroll owner;
- the bento grid participates in normal layout and determines its own height;
- use CSS grid row and column placement from the pure packer, without absolutely positioning the
  graph wrappers;
- use fixed grid row units based on the existing Live graph minimum height, with tall items
  spanning two rows;
- use `min-h-0`, `min-w-0`, `overflow-x-hidden`, and a stable scrollbar gutter on the graph scroll
  owner;
- do not put `overflow-y-auto` on individual graph frames;
- calculate drag targets from item bounds or ordered insertion points, never from `scrollTop` plus
  a synthetic row height;
- preserve the scroll position when toggling width or height when possible, and clamp it only when
  compaction shortens the document below the current position;
- when switching modes, scroll the active graph into view only if it would otherwise be outside
  the viewport. Do not force the graph area back to the top.

At narrow widths the bento grid collapses to one column. Full/half width state is retained, but
both render as one column until two columns fit again. Packing and bento-to-default conversion use
the two-column logical model, so resizing the window does not silently reorder panels.

### State and reducer changes

Keep bento metadata separate from Viewer `Panel.wide` semantics. Add Live-specific layout state,
for example:

```ts
interface LiveBentoItemState {
  id: string
  width: 'half' | 'full'
  height: 'short' | 'tall'
}
```

Store it beside the Live layout or in a Live-only wrapper state keyed by stable graph item ID.
Required actions are:

- set layout mode and perform ordered conversion;
- move a bento item to an insertion index;
- toggle bento width;
- toggle bento height;
- add/remove item metadata alongside graph visibility;
- normalize stale metadata when a graph no longer exists.

Do not add bento fields to Viewer workbook serialization during this part. Layout persistence and
migration remain Part 3 of the feature-parity table.

### Planned file changes

| File | Part 2 change |
|---|---|
| `frontend/src/settings/liveLayout.ts` | Define `default`/`bento`, safe preference loading, and saving. |
| `frontend/src/views/SettingsView.tsx` | Add the Live view section and controlled layout selector. |
| `frontend/src/App.tsx` | Own the mode, persist changes, and pass it only to `LiveView`. |
| `frontend/src/views/LiveView.tsx` | Build all Live graph items, select the renderer by mode, and host the single graph scroll area. |
| `frontend/src/components/LiveGraphStack.tsx` | Render the current default stack or the compact bento grid and handle ordered drag previews. |
| `frontend/src/state/liveBento.ts` | Hold pure dense packing, ordering, sizing, normalization, and conversion helpers. |
| `frontend/src/live/LivePlotPanel.tsx` | Add common bento frame controls without changing plot behavior in default mode. |
| `frontend/src/live/LiveMap.tsx` | Support docked and bento hosts through one map implementation. |
| `frontend/src/ui.ts` | Add shared bento grid/frame classes with one-pixel separation and no outer card gaps. |
| `docs/frontend.md` | Document Live-only mode behavior and conversion order. |

### Test plan

Add pure state tests first, then integration tests around Settings and Live.

1. Preference tests:
   - missing, invalid, or inaccessible storage returns `default`;
   - Settings changes and reloads the saved mode;
   - Viewer receives no mode and does not change when the preference changes.
2. Dense packing tests:
   - equal short/half items fill left to right, then top to bottom;
   - full and tall items never overlap;
   - later compatible items fill the earliest available cell;
   - removal and size toggles repack without preserving empty rows;
   - packing is deterministic for stable IDs and order.
3. Transition tests:
   - the initial mode renders the existing default stack;
   - default to bento preserves graph IDs, streams, active graph, and graph state;
   - bento to default produces row/column visual order, left to right and top to bottom;
   - a bento drag followed by a return to default produces the reordered vertical stack;
   - repeated default/bento transitions do not duplicate or lose graphs;
   - bento width and height choices survive both transitions.
4. Live graph tests:
   - empty, waiting, single-stream, and multi-stream Live plots render in both modes;
   - the track map moves between docked and bento presentation without duplicate subscriptions;
   - adding and closing a graph updates both the ordered items and compact placement.
5. Scrolling regressions:
   - only the graph-area element owns vertical scrolling;
   - bento output contains no absolute-positioned spacer or synthetic inline container height;
   - toggling width/height keeps the active graph mounted and does not reset its plot state;
   - compaction reduces grid height to its real final row with no trailing blank scroll area.
6. Run the complete frontend suite, typecheck, lint, and formatting checks.

### Part 2 acceptance criteria

- Live starts in the current default layout for new and invalid preferences.
- Bento can be selected only from Settings and the choice survives an app restart.
- Viewer behavior and workbook layout are unchanged.
- All current Live graphs render and remain functional in bento.
- Bento uses one-pixel separation with no card gutters or preserved empty grid cells.
- Width and height toggles work independently and survive mode switches.
- Default-to-bento order is left to right, then top to bottom.
- Bento-to-default converts the visible order to a vertical stack using row, then column priority.
- The graph area has one vertical scrollbar and no synthetic trailing scroll space.
- The transition and scrolling regression tests described above pass with the full frontend gate.

## Feature-parity reference

The table below remains the map between `dev-2` and the feature work available on `dev`. It is
reference material for later incremental ports; it does not change the branch convention above.

| Pasted section | `dev-2` status | Difference |
|---|---|---|
| 1. Settings/layout modes | Shell implemented | Settings is a top-level, sidebar-free vertical page. Part 2 adds its first control for the Live layout mode. |
| 2. Bento layout | Implemented for Live | Settings-only opt-in, compact ordered packing, one-pixel separation, width/height toggles, current Live plots and track map, and row/column conversion back to default. Viewer is excluded. |
| 3. Layout persistence/migration | Different | Viewer persists a global multi-worksheet workbook under `dawg.workbook.v1`. Live layouts are session-only. No per-profile `live-plots.v3` or v1/v2 migration. Viewer arrangement is persistent rather than session-local. |
| 4. Histograms | Partial | Viewer-only histogram panel with synchronized visible ranges, percentage frequency, lap comparison, statistics, and choices of 10/20/40/80/160 bins. No Live histogram, conversion, custom range, count mode, orientation, manual frequency maximum, cursor-bin text, or total count. |
| 5. Per-plot settings menu | Missing | No right-click/keyboard/portal menu. Controls are placed in panel headers, sidebars, editors, or dedicated dialogs. |
| 6. Stream colors | Partial/different | Profile-backed channel colors propagate to Live and Viewer and are editable in the channel editor. There is no shared `dawg.stream-colors.v1` override store, ten-color picker, or local reset workflow. |
| 7. Editable cards | Missing | Cards remain derived from profile `pinned`, `large`, and `order` configuration. No pin search, UI editing, drag/drop, width toggling, or per-profile card storage. |
| 8. Card freshness | Partial | Border color ages every 500 ms and warning/critical backgrounds remain. No dot and no direct stopped/error-state reaction. |
| 9. Channel list | Partial/different | Searches name/label/group and adds editing, filtering, deletion, and sensor-map tools. It does not search unit, list unseen configured channels, or enter card-selection mode. |
| 10. Graph-aware selection | Partial | Histogram/map are single-channel; XY chooses two; launch/aero ignore channel selection; the final panel becomes an empty time plot. No seven-stream cap. |
| 11. Live profile integration | Partial | Live metadata and calibration come from the active profile. Layouts and card arrangements are not saved or restored per profile. |
| 12. Viewer integration | Different and broader | Has histograms and profile colors, but not the pasted bento/settings/context-menu implementation. Adds worksheets, XY, maps, FFT, launch, aero, lap overlays, math, filters, comparisons, and setups. |
| 13. Layout/scroll fixes | Mostly present | Full-height shell, `min-width: 0`, contained plot scrolling, fixed sidebars, wrapping legends, and overflow constraints are present. |
| 14. Test infrastructure | Implemented and broader | Vitest/jsdom/RTL setup exists. Current run: 69 tests across 16 files, versus 50 tests in the pasted inventory. Coverage focuses heavily on analysis math and backend-integrated features. |
| 15. CI/workflow | Implemented | Frontend tests run in CI and through `just test-web`; typecheck, lint, and formatting are also included. |
| 16. Documentation | Implemented, different scope | README and architecture documentation cover the Pi Toolbox workflow, analysis panels, calibration, setups, filters, test mode, and backend changes—not the pasted bento/settings model. |
| 17. Backend unchanged | Opposite | `dev-2` contains substantial Go/backend changes: configuration editing, calibration, presets, live timebase, services, and associated tests. |
