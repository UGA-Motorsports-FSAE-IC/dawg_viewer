import type { PlotLayoutMode } from '../settings/plotLayout'

export function SettingsView({
  plotLayoutMode,
  onPlotLayoutMode,
}: {
  plotLayoutMode: PlotLayoutMode
  onPlotLayoutMode: (mode: PlotLayoutMode) => void
}) {
  return (
    <main className="h-full overflow-y-auto bg-zinc-900 p-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
        <section className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="text-sm font-medium text-zinc-100">Plot layout</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Choose how plots are arranged in both Live and Viewer.
          </p>
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Plot layout</legend>
            {(
              [
                ['full', 'Full-size plots', 'Stack full-width plots in their original layout.'],
                ['bento', 'Bento grid', 'Arrange, resize, and move plots in a two-column grid.'],
              ] as const
            ).map(([value, label, description]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-md border p-3 transition-colors ${
                  plotLayoutMode === value
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <span className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="radio"
                    name="plot-layout"
                    value={value}
                    checked={plotLayoutMode === value}
                    onChange={() => onPlotLayoutMode(value)}
                    className="accent-red-500"
                  />
                  {label}
                </span>
                <span className="mt-1 block pl-5 text-xs text-zinc-500">{description}</span>
              </label>
            ))}
          </fieldset>
        </section>
      </div>
    </main>
  )
}
