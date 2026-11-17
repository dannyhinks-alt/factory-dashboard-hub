# Factory Dashboard & Flow Hub V1

Offline, gap-first analyser for the "LEAN CELL DESIGN: FACTORY DASHBOARD" workbook. React + TypeScript + Tailwind; SheetJS and `docx` are bundled, with no runtime CDNs.

```
npm install
npm run dev            # development
npm run typecheck      # tsc
npm test               # unit tests (vitest)
npm run build:offline  # -> dist-offline/index.html (single self-contained file)
npm run test:e2e       # headless Chromium against the offline build
npm run verify         # all of the above
```

`dist-offline/index.html` is committed with `git add -f` so it can be handed to restricted laptops directly.

## Workbook tabs
Dashboard, Compare, Data, Assessor, FPD, Lead time, Sensitivity, Levers, Scenarios, Register, Settings, Dictionary. Missing tabs, blank rows and placeholder text ("TBC", "[enter]") are tolerated and become Data Check gaps. Input tabs are read by header name (`src/engine/xlsx.ts`); Dashboard, Compare and Sensitivity are regenerated on export. Tabs the app does not own are preserved.

## Key definitions
- Headroom = 1 − effective utilisation ÷ class limit; effective utilisation = load ÷ (planned weeks × shift hours × machines × OEE).
- GREEN ≥ 10%, AMBER 0–10%, RED < 0%. Verdict: BAD if any RED, WATCH if any AMBER or ERROR, else GOOD.
- Process lead time = hours ÷ volume ÷ working hours per day; WIP = (volume ÷ planned weeks × 5) × lead time.
- Register score = time × cost impact; HIGH ≥ 15, MEDIUM ≥ 8.

## Layout
`src/engine` is pure TypeScript (calc, flow, checks, sensitivity, governance, selftest, xlsx). `src/ui` holds the six workspaces. Tests are in `tests/` and `e2e/`.
