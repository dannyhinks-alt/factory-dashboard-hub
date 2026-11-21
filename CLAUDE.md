# CLAUDE.md — Factory Dashboard Hub

## Project overview

Vite 6 + React 18 + TypeScript strict + Tailwind 3 single-page application for manufacturing capacity planning.  
Offline build produces a single self-contained HTML file (`dist-offline/index.html`) with inlined JS/CSS and embedded master state.

---

## Language & terminology

- **British English** throughout — favour, utilisation, licence (noun), analyse, colour, etc.
- **Zero retail terminology** — no "customers", "sales", "revenue", "retail", "store", "shop floor" in user-facing strings.
- Manufacturing vocabulary: assets, cells, factories, utilisation, headroom, OEE, shift pattern, complexity class, planned weeks, demand units, capacity.

---

## Workflow (mandatory every task)

1. `npx tsc --noEmit` — must pass with zero errors.
2. `npx vitest run` — all unit tests must pass.
3. `node e2e/run.mjs` — all e2e assertions must pass.
4. `npm run build:offline` — rebuilds `dist-offline/index.html`.
5. `git add -f dist-offline/index.html` — force-add the built file.
6. Commit and **push directly to `main`** — no feature branches, no PRs unless explicitly requested.

---

## Repository layout

```
src/
  engine/          Pure TypeScript business logic (no React imports)
    assumed.ts     Wizard defaults, applyWizard, pruneAssumed, revertUnverified
    calc.ts        calcAsset, cells, rollCell, band, machinesToAdd
    checks.ts      34 Data Check rules (DC01–DC34)
    gaps.ts        Export Gaps workbook builder
    normalise.ts   normaliseModel
    sensitivity.ts factoryScenarioDelta, assetScenario, pressureList, testSets
    types.ts       Model, Asset, CellLine, Scenario, LeverSet, … (source of truth)
  ui/              React components
    WsData.tsx     Dense data-entry table
    WsDashboard.tsx Dashboard cards, UtilBars
    WsSensitivity.tsx Sensitivity / Scenario tab incl. AssetPlanner & factory scenario
    charts.tsx     UtilBars, Ring, HBars, Seg, etc.
  persist.ts       serialise / deserialise / readCachedSession
  selfSave.ts      injectEmbeddedState / pickBootState
tests/             Vitest unit tests
e2e/run.mjs        Playwright end-to-end assertions (Chromium)
dist-offline/      Built output — always rebuild and force-add after changes
vite.offline.config.ts  Custom offline build plugin (IIFE, inlined assets)
```

---

## Engine rules

### Wizard defaults (`src/engine/assumed.ts`)

```typescript
export const DEFAULT_RULES: WizardRules = {
  plannedWeeks:  { on: true, weeks: 48 },
  shift:         { on: true, pattern: '2 Shifts' },
  complexity:    { on: true, className: 'Standard' },
  oee:           { on: true, fraction: 0.70 },   // 70 % on by default
};
```

All four rules are **on by default**. OEE default is **70 %** (not 85 %).

### VA / ENVA / NVA (`vaPct`, `envaPct`)

- These fields exist on the `Asset` type for model completeness but are **only shown and edited on Cell summary rows**.
- **Never render** `vaPct` / `envaPct` inputs on asset rows in the dense table (`WsData.tsx`).

### Demand validation — DC05 & Export Gaps

- DC05 must **not** flag a cell-level demand gap when any asset in that cell already has demand typed.
- `cellRow` in `gaps.ts` must receive the full `Model` as its first argument and perform the same check.

### UtilBars (`src/ui/charts.tsx`)

- Over-limit bars: `#dc2626` (red).
- Within-limit bars: `#0B5CAB` (blue).
- Inline context label on each bar: `effUtil% / limit% · headroom%`.
- Hover tooltip: full formula breakdown.

---

## State & persistence

- `assumedFields: Record<string, string | number>` on `Model` — provenance map for every wizard-filled field.
- Keys: `factoryKey(factory)` for planned weeks, `assetKey(id, field)` for asset fields.
- Persisted in localStorage, `.json` auto-save, and the `#embedded-master-state` JSON block in the offline HTML.
- `pruneAssumed(before, after)` — call after every model diff to clear keys whose values changed.
- `revertUnverified(m)` — restores blanks for still-assumed fields; returns count reverted.

---

## TypeScript conventions

- Strict mode; no `any` without a cast comment explaining why.
- Pure engine functions live in `src/engine/` — no React imports there.
- Component state uses `useState`; derived values are `useMemo` where expensive.
- `structuredClone` for deep copies in scenario functions; never mutate the master model in live previews.

---

## Testing conventions

- Vitest unit tests in `tests/` — environment is `node`.
- E2e tests in `e2e/run.mjs` — Playwright Chromium, headless.
- When OEE defaults change, update **both** `tests/assumed.test.ts` and `e2e/run.mjs`.
- Badge / "Show Assumed Only (N)" counts must match `assumedCount(m)` exactly.

---

## Commit style

- Short imperative subject line, present tense.
- No model identifier in commit messages or PR bodies.
- Attribution footer:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01E3ehJcjepMAEe5ybkAPLD8
  ```
