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

## Feature-parity reference

The table below remains the map between `dev-2` and the feature work available on `dev`. It is
reference material for later incremental ports; it does not change the branch convention above.

| Pasted section | `dev-2` status | Difference |
|---|---|---|
| 1. Settings/layout modes | Missing/replaced | No Settings tab or global layout mode. A Car tab and global Setups/Test Mode controls exist instead. |
| 2. Bento layout | Partial | Viewer has two columns, half/full width, fixed tall panels, and arrow reordering. No dragging, collision engine, phantom, arbitrary percentage width, pixel height, or resize handles. Live is not bento. |
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
| 14. Test infrastructure | Implemented and broader | Vitest/jsdom/RTL setup exists. Current run: 68 tests across 16 files, versus 50 tests in the pasted inventory. Coverage focuses heavily on analysis math and backend-integrated features. |
| 15. CI/workflow | Implemented | Frontend tests run in CI and through `just test-web`; typecheck, lint, and formatting are also included. |
| 16. Documentation | Implemented, different scope | README and architecture documentation cover the Pi Toolbox workflow, analysis panels, calibration, setups, filters, test mode, and backend changes—not the pasted bento/settings model. |
| 17. Backend unchanged | Opposite | `dev-2` contains substantial Go/backend changes: configuration editing, calibration, presets, live timebase, services, and associated tests. |
