# The Waiting Game — Lead Magnet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single self-contained HTML file that animates a Social Security "wait vs. file at 62" line chart and lets the user drag a playhead across ages 62–95.

**Architecture:** One `index.html` with all markup, CSS, and JS inline — no build step, no network requests. An inline `<script>` holds a pure data model (`computeSeries`), an SVG chart renderer, a `requestAnimationFrame` sweep animation, and pointer-drag handling. The data model and a few helpers are exposed on `window.WaitingGame` so the browser-pane verification steps can assert against known numbers.

**Tech Stack:** Plain HTML5, inline CSS, vanilla ES2020 JavaScript, inline SVG. No frameworks, no libraries, no CDN. Verification via the Claude Browser pane tools (`navigate`, `javascript_tool`, `read_page`, `computer` screenshot, `resize_window`).

## Global Constraints

> **Revision 2026-09-02 (post-implementation, fix round 2):** `$2,075` is now
> the **PIA (FRA benefit)**, not the age-62 check. Age-62 = 70% of PIA ≈
> `$1,453`. `PIA = 2075`; `AGE62_CHECK = PIA * 0.70 = 1452.5` (derived). The
> canonical table below and every inline expected value in Tasks 1/3/6/8 that
> predates this note are superseded by the **Revised canonical reference
> values** table. Uniform 0.70 scaling → the chart geometry / animation are
> unchanged. The repo's `verify.mjs` is the living guard.

- App file path: `/Users/kurtzahner/New 62-70 Benefit App/index.html` (a git repo initialised in that folder in Task 1; **not** the `ss-calc-main` repo).
- Single file. All CSS and JS inline. **Zero external requests** — no CDN, no web fonts, no analytics. System font stack only.
- Must open correctly from `file://` and from a static server.
- All dollar figures are illustrative. **No calendar years anywhere in the UI.**
- **PIA at FRA 67 = `$2,075`.** Age-62 check = `PIA * 0.70 = $1,452.5` (≈ $1,453). `const PIA = 2075; const AGE62_CHECK = PIA * FACTOR[62];`
- COLA = **2.5%/year**, compounding from age 62 onward (including pre-claim years).
- Chart age range fixed **62 → 95**. Not adjustable.
- Married = every dollar figure **× 2**.
- SSA age factors (FRA 67): `{62:0.70, 63:0.75, 64:0.80, 65:0.8666667, 66:0.9333333, 67:1.00, 68:1.08, 69:1.16, 70:1.24}`.
- Filed-at-62 line is **amber `#E39234`** (owner revision 2026-09-02, was green `#4ade80`); collecting-from-70 line is **bold green `#16a34a`**. Waiting line is **dotted gray**.
- Legend numbers are **red** until the playhead reaches 70, when the right-hand number turns **green**.
- Respect `prefers-reduced-motion`: skip the sweep, render the full chart, playhead at 62 and draggable immediately.
- Frequent commits — every task ends with a commit in the app folder's repo.

## Revised canonical reference values (single earner) — PIA = $2,075

Tests / `verify.mjs` assert against these with **±2** tolerance (rounded
dollars). Married = ×2.

| Age | Filed at 62 | Waiting / Collecting |
|---|---|---|
| 62 | 1453 | 1453 |
| 63 | 1489 | 1595 |
| 64 | 1526 | 1744 |
| 65 | 1564 | 1937 |
| 66 | 1603 | 2138 |
| 67 | 1643 | 2348 |
| 68 | 1684 | 2599 |
| 69 | 1727 | 2862 |
| 70 | 1770 | 3135 |
| 75 | 2002 | 3547 |
| 80 | 2265 | 4013 |
| 85 | 2563 | 4540 |
| 90 | 2900 | 5137 |
| 95 | 3281 | 5812 |

`at70` (value where the dotted line meets the green line) = **3134.95** single.

<details><summary>Superseded original table (PIA = $2,964, $2,075 as age-62 check)</summary>

| Age | Filed at 62 | Waiting / Collecting |
|---|---|---|
| 62 | 2075 | 2075 |
| 70 | 2528 | 4479 |
| 95 | 4687 | 8303 |

`at70` = 4478.50. Inline task-step numbers from before the revision follow this scale.
</details>

## File Structure

```
/Users/kurtzahner/New 62-70 Benefit App/
  index.html      # the entire app — markup + <style> + <script>
  README.md       # what it is, how to open, baked assumptions, what's omitted
  .gitignore      # .DS_Store
```

Inside `index.html` the `<script>` is organised as:

- **Constants block** — `AGE_MIN=62`, `AGE_MAX=95`, `WAIT_MAX=70`, `AGE62_CHECK=2075`, `PIA`, `COLA=0.025`, `FACTOR` table.
- **`computeSeries(mode)`** — pure function returning all line data.
- **Geometry** — `xScale(age)`, `yScale(value)`, `yMaxFor(series)`.
- **`buildChart(series)`** — draws axes, gridlines, ticks, and the three line paths into the SVG.
- **`updateLegend(age)`** — sets the two legend numbers/labels/colours.
- **`runSweep()`** — the rAF animation; calls `finishSweep()` on completion.
- **`enableDrag()`** — attaches pointer handlers to the playhead handle.
- **`setMode(mode)`** — toggle handler: recompute, rescale, re-run sweep.
- **`setAge(age)`** — test/utility helper: move playhead + update legend.
- **`window.WaitingGame = { computeSeries, FACTOR, PIA, setAge, setMode, runSweep, getState }`**.

---

### Task 1: Scaffold + data model

**Files:**
- Create: `/Users/kurtzahner/New 62-70 Benefit App/index.html`
- Create: `/Users/kurtzahner/New 62-70 Benefit App/README.md`
- Create: `/Users/kurtzahner/New 62-70 Benefit App/.gitignore`

**Interfaces:**
- Produces:
  - `computeSeries(mode: 'single'|'married') => { ages:number[], filed62:number[], waitingAges:number[], waiting:number[], collectingAges:number[], collecting:number[], at70:number }`
    - `ages` = 62..95 inclusive. `filed62[i]` corresponds to `ages[i]`.
    - `waitingAges` = 62..70 inclusive. `collectingAges` = 70..95 inclusive.
  - `window.WaitingGame.computeSeries` — same function.
  - `window.WaitingGame.PIA` === `2075/0.7`.
  - `window.WaitingGame.FACTOR` — the age-factor object.

- [ ] **Step 1: Create `.gitignore` and `README.md`**

`.gitignore`:
```
.DS_Store
```

`README.md`:
```markdown
# The Waiting Game

A single-file, self-contained illustration of what Social Security claimants
give up by filing at 62 instead of waiting. Open `index.html` in any browser —
no server, no build, no internet connection required.

## What it shows

An animated line chart sweeps from age 62 to 95:

- **Light green line** — the check of someone who filed at 62, growing only with
  cost-of-living adjustments (COLA).
- **Dotted gray line (62–70)** — the larger check you lock in by waiting one
  more year, including the COLAs that accrue even before you claim.
- **Bold green line (70–95)** — the check you actually collect once you claim at
  70, still growing with COLA.

After the 10-second animation, drag the vertical line to any age to compare the
two checks at that point.

## Baked-in assumptions (illustrative — no real dates or personal data)

- Age-62 check: $2,075/mo (2026 average retirement benefit)
- Full Retirement Age: 67
- COLA: 2.5% per year, every year from 62 onward
- Married = both figures doubled (two identical earners)

## Deliberately omitted (for now)

Email capture, saved results, personalised inputs, month-level detail, a
running "winnings" total, and survivor/divorced variants.
```

- [ ] **Step 2: Write `index.html` skeleton with the data model**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Waiting Game</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; background: #fafafa;
  }
  .wrap { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  .sub { color: #6b7280; margin: 0 0 16px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>The Waiting Game</h1>
  <p class="sub">Every year you wait is a bigger check — for life. Quit whenever you want.</p>
  <div id="chart-area"></div>
</div>
<script>
(function () {
  "use strict";

  const AGE_MIN = 62, AGE_MAX = 95, WAIT_MAX = 70;
  const AGE62_CHECK = 2075;
  const PIA = AGE62_CHECK / 0.70;         // 2964.285714...
  const COLA = 0.025;
  const FACTOR = {
    62: 0.70, 63: 0.75, 64: 0.80, 65: 0.8666667, 66: 0.9333333,
    67: 1.00, 68: 1.08, 69: 1.16, 70: 1.24
  };

  const cola = (yearsFrom62) => Math.pow(1 + COLA, yearsFrom62);
  const range = (lo, hi) => {
    const out = [];
    for (let a = lo; a <= hi; a++) out.push(a);
    return out;
  };

  function computeSeries(mode) {
    const M = mode === "married" ? 2 : 1;
    const ages = range(AGE_MIN, AGE_MAX);
    const filed62 = ages.map((a) => AGE62_CHECK * M * cola(a - 62));

    const waitingAges = range(AGE_MIN, WAIT_MAX);
    const waiting = waitingAges.map((a) => PIA * M * FACTOR[a] * cola(a - 62));

    const at70 = PIA * M * FACTOR[70] * cola(WAIT_MAX - 62);
    const collectingAges = range(WAIT_MAX, AGE_MAX);
    const collecting = collectingAges.map((a) => at70 * cola(a - WAIT_MAX));

    return { ages, filed62, waitingAges, waiting, collectingAges, collecting, at70 };
  }

  window.WaitingGame = { computeSeries, FACTOR, PIA };
})();
</script>
</body>
</html>
```

- [ ] **Step 3: `git init` the app folder and make the first commit**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git init
git add .
git commit -m "chore: scaffold Waiting Game single-file app + data model"
```

- [ ] **Step 4: Write the failing verification, then run it**

Open the file in the browser pane:
`mcp__Claude_Browser__navigate` → `file:///Users/kurtzahner/New%2062-70%20Benefit%20App/index.html`

Then `mcp__Claude_Browser__javascript_tool` with:
```js
const s = window.WaitingGame.computeSeries('single');
const near = (a, b) => Math.abs(a - b) <= 2;
const idx = (age) => age - 62;
const checks = [
  near(s.filed62[idx(62)], 2075),
  near(s.filed62[idx(70)], 2528),
  near(s.filed62[idx(95)], 4687),
  near(s.waiting[62 - 62], 2075),
  near(s.waiting[67 - 62], 3354),
  near(s.waiting[70 - 62], 4479),
  near(s.at70, 4478.5),
  near(s.collecting[95 - 70], 8303),
  s.ages.length === 34,
  s.waitingAges.length === 9,
  s.collectingAges.length === 26,
];
const m = window.WaitingGame.computeSeries('married');
checks.push(near(m.filed62[idx(62)], 4150), near(m.collecting[95 - 70], 16606));
JSON.stringify({ pass: checks.every(Boolean), checks });
```
Expected before Step 2 is complete: error (`WaitingGame` undefined). After: `{"pass":true,...}`.

- [ ] **Step 5: Commit any fixes**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "test: verify data model against reference values" --allow-empty
```

---

### Task 2: Static chart render

**Files:**
- Modify: `/Users/kurtzahner/New 62-70 Benefit App/index.html` (`<style>` + `<script>`)

**Interfaces:**
- Consumes: `computeSeries` from Task 1.
- Produces:
  - `xScale(age:number) => number` — SVG user-space X, `age` in 62..95.
  - `yScale(value:number) => number` — SVG user-space Y.
  - `yMaxFor(series) => number` — `series.collecting` max × 1.06.
  - `buildChart(series)` — clears `#chart svg` content and draws gridlines, x-axis ticks (62, 70, 95), and three `<path>` elements with ids `#line-filed62`, `#line-waiting`, `#line-collecting`.
  - Module vars: `svg` (the SVG element), `currentSeries`, `yMax`.
  - SVG `viewBox="0 0 1000 520"`. Plot rect: x 56→960, y 56→470.

- [ ] **Step 1: Add SVG container markup and styles**

Replace `<div id="chart-area"></div>` with:
```html
<div id="chart">
  <svg viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet" role="img"
       aria-label="Monthly Social Security check by claiming age, filing at 62 versus waiting">
    <g id="grid"></g>
    <g id="axis"></g>
    <path id="line-filed62"></path>
    <path id="line-waiting"></path>
    <path id="line-collecting"></path>
    <g id="playhead-layer"></g>
  </svg>
</div>
```

Add to `<style>`:
```css
  #chart { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px; }
  #chart svg { width: 100%; height: auto; display: block; }
  #line-filed62   { fill: none; stroke: #86efac; stroke-width: 3; }
  #line-waiting   { fill: none; stroke: #9ca3af; stroke-width: 3; stroke-dasharray: 2 7; stroke-linecap: round; }
  #line-collecting{ fill: none; stroke: #16a34a; stroke-width: 5; }
  .grid-line { stroke: #f3f4f6; stroke-width: 1; }
  .tick-label { fill: #6b7280; font-size: 20px; font-weight: 600; }
  .axis-line  { stroke: #d1d5db; stroke-width: 2; }
```

- [ ] **Step 2: Write the failing verification**

`mcp__Claude_Browser__javascript_tool`:
```js
const p = (id) => document.getElementById(id).getAttribute('d') || '';
JSON.stringify({
  filed62HasPath: p('line-filed62').startsWith('M'),
  waitingHasPath: p('line-waiting').startsWith('M'),
  collectingHasPath: p('line-collecting').startsWith('M'),
  ticks: [...document.querySelectorAll('#axis .tick-label')].map(t => t.textContent),
});
```
Expected now: empty paths, no ticks.

- [ ] **Step 3: Implement geometry + `buildChart`**

Add inside the IIFE, before `window.WaitingGame`:
```js
  const PLOT = { x0: 56, x1: 960, y0: 56, y1: 470 };
  const svg = document.querySelector('#chart svg');
  const NS = 'http://www.w3.org/2000/svg';
  let currentSeries = null, yMax = 0;

  const xScale = (age) =>
    PLOT.x0 + ((age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * (PLOT.x1 - PLOT.x0);
  const yScale = (v) =>
    PLOT.y1 - (v / yMax) * (PLOT.y1 - PLOT.y0);
  const yMaxFor = (s) => Math.max(...s.collecting) * 1.06;

  const pathFrom = (ages, values) =>
    ages.map((a, i) => (i ? 'L' : 'M') + xScale(a).toFixed(1) + ',' + yScale(values[i]).toFixed(1)).join(' ');

  const el = (name, attrs) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  function buildChart(s) {
    currentSeries = s;
    yMax = yMaxFor(s);

    const grid = svg.querySelector('#grid');
    const axis = svg.querySelector('#axis');
    grid.textContent = '';
    axis.textContent = '';

    // 3 faint horizontal gridlines
    for (let i = 1; i <= 3; i++) {
      const y = PLOT.y0 + (i / 4) * (PLOT.y1 - PLOT.y0);
      grid.appendChild(el('line', { class: 'grid-line', x1: PLOT.x0, x2: PLOT.x1, y1: y, y2: y }));
    }

    // baseline
    axis.appendChild(el('line', { class: 'axis-line', x1: PLOT.x0, x2: PLOT.x1, y1: PLOT.y1, y2: PLOT.y1 }));

    // x ticks: 62, 70, 95
    [[62, '62'], [70, '70'], [95, '95']].forEach(([age, label]) => {
      const x = xScale(age);
      axis.appendChild(el('line', { class: 'axis-line', x1: x, x2: x, y1: PLOT.y1, y2: PLOT.y1 + 8 }));
      const t = el('text', { class: 'tick-label', x: x, y: PLOT.y1 + 30, 'text-anchor': 'middle' });
      t.textContent = label;
      axis.appendChild(t);
    });

    svg.querySelector('#line-filed62').setAttribute('d', pathFrom(s.ages, s.filed62));
    svg.querySelector('#line-waiting').setAttribute('d', pathFrom(s.waitingAges, s.waiting));
    svg.querySelector('#line-collecting').setAttribute('d', pathFrom(s.collectingAges, s.collecting));
  }

  buildChart(computeSeries('single'));
```

Add `buildChart`, `xScale`, `yScale`, `yMaxFor` to the `window.WaitingGame` object.

- [ ] **Step 4: Run the verification**

Re-run the Step 2 snippet. Expected:
```json
{ "filed62HasPath": true, "waitingHasPath": true, "collectingHasPath": true, "ticks": ["62","70","95"] }
```
Then take a screenshot (`mcp__Claude_Browser__computer` `screenshot`) and confirm visually: two green lines diverging from a shared left point, dotted line between them ending at age 70, bold green continuing to the right edge.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "feat: render static three-line SVG chart with axes"
```

---

### Task 3: Legend box

**Files:**
- Modify: `/Users/kurtzahner/New 62-70 Benefit App/index.html`

**Interfaces:**
- Consumes: `currentSeries`, `xScale` from Task 2.
- Produces:
  - `updateLegend(age:number)` — sets legend DOM. `age` clamped to 62..95.
    - Left cell: label `"Filed at 62"`, value `currentSeries.filed62[age-62]`, class `neg` (red).
    - Right cell when `age < 70`: label `"If you claim at " + age`, value `currentSeries.waiting[age-62]`, class `neg` (red).
    - Right cell when `age >= 70`: label `"Your check"`, value `currentSeries.collecting[age-70]`, class `pos` (green).
  - `money(v:number) => string` — `"$" + Math.round(v).toLocaleString('en-US')`.
  - Module var `currentAge` (init 62).
  - `setAge(age)` — sets `currentAge`, calls `updateLegend(age)` (playhead move added in Task 4; for now just legend).

- [ ] **Step 1: Add legend markup + styles**

Inside `#chart`, immediately after the `<svg>` closing tag, add:
```html
  <div id="legend">
    <div class="cell">
      <div class="cap" id="lg-left-label">Filed at 62</div>
      <div class="amt neg" id="lg-left-value">$0</div>
    </div>
    <div class="cell">
      <div class="cap" id="lg-right-label">If you claim at 62</div>
      <div class="amt neg" id="lg-right-value">$0</div>
    </div>
  </div>
```

Styles:
```css
  #chart { position: relative; }
  #legend {
    position: absolute; top: 22px; left: 40px;
    display: flex; border: 1px solid #d1d5db; border-radius: 8px;
    background: rgba(255,255,255,0.92); overflow: hidden;
  }
  #legend .cell { padding: 10px 16px; min-width: 128px; }
  #legend .cell + .cell { border-left: 1px solid #d1d5db; }
  #legend .cap { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .03em; }
  #legend .amt { font-size: 22px; font-weight: 800; margin-top: 2px; }
  #legend .amt.neg { color: #dc2626; }
  #legend .amt.pos { color: #16a34a; }
```

- [ ] **Step 2: Write the failing verification**

`javascript_tool`:
```js
window.WaitingGame.setAge(65);
const a = {
  leftLabel: lgText('lg-left-label'), leftVal: lgText('lg-left-value'),
  rightLabel: lgText('lg-right-label'), rightVal: lgText('lg-right-value'),
  rightClass: document.getElementById('lg-right-value').className,
};
window.WaitingGame.setAge(72);
const b = {
  rightLabel: lgText('lg-right-label'), rightVal: lgText('lg-right-value'),
  rightClass: document.getElementById('lg-right-value').className,
};
function lgText(id){ return document.getElementById(id).textContent; }
JSON.stringify({ a, b });
```
Expected now: `setAge` undefined.

- [ ] **Step 3: Implement `money`, `updateLegend`, `setAge`**

```js
  let currentAge = AGE_MIN;

  const money = (v) => '$' + Math.round(v).toLocaleString('en-US');

  function updateLegend(age) {
    const a = Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(age)));
    document.getElementById('lg-left-label').textContent = 'Filed at 62';
    document.getElementById('lg-left-value').textContent = money(currentSeries.filed62[a - 62]);
    document.getElementById('lg-left-value').className = 'amt neg';

    const rl = document.getElementById('lg-right-label');
    const rv = document.getElementById('lg-right-value');
    if (a < WAIT_MAX) {
      rl.textContent = 'If you claim at ' + a;
      rv.textContent = money(currentSeries.waiting[a - 62]);
      rv.className = 'amt neg';
    } else {
      rl.textContent = 'Your check';
      rv.textContent = money(currentSeries.collecting[a - WAIT_MAX]);
      rv.className = 'amt pos';
    }
  }

  function setAge(age) {
    currentAge = Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(age)));
    updateLegend(currentAge);
    if (typeof movePlayhead === 'function') movePlayhead(currentAge);
  }

  updateLegend(currentAge);
```

Add `updateLegend`, `setAge`, `money` to `window.WaitingGame`.

- [ ] **Step 4: Run the verification**

Re-run Step 2. Expected:
```json
{
  "a": { "leftLabel": "Filed at 62", "leftVal": "$2,235", "rightLabel": "If you claim at 65",
         "rightVal": "$2,767", "rightClass": "amt neg" },
  "b": { "rightLabel": "Your check", "rightVal": "$4,705", "rightClass": "amt pos" }
}
```
(±2 on the dollar values.) Case `b` is `setAge(72)` → `collecting[72-70]` =
`at70 * 1.025^2` ≈ $4,705 (the check at age 72). The right cell always shows
the collecting line **at the playhead age**, indexed `collecting[age-70]`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "feat: playhead-driven legend with red/green semantics"
```

---

### Task 4: Sweep animation + progressive reveal + flash at 70

**Files:**
- Modify: `/Users/kurtzahner/New 62-70 Benefit App/index.html`

**Interfaces:**
- Consumes: `xScale`, `PLOT`, `setAge`, `updateLegend`, `currentSeries` from earlier tasks.
- Produces:
  - `movePlayhead(age:number)` — positions the playhead group + reveal clip at `xScale(age)`.
  - `runSweep()` — animates age 62→95 over `SWEEP_MS` (10000), calls `finishSweep()` at the end. Idempotent (cancels any in-flight sweep first).
  - `finishSweep()` — reveals all lines fully, calls `enableDrag()` (defined Task 5; guard with `typeof`), shows `#drag-hint`.
  - `prefersReducedMotion()` boolean helper.
  - Constant `SWEEP_MS = 10000`.
  - A `<clipPath id="reveal">` with a `<rect>` whose `width` is animated; the three line paths are wrapped in `<g clip-path="url(#reveal)">`.

- [ ] **Step 1: Add reveal clip, playhead, flash label, and hint markup**

Wrap the three `<path>` elements in the SVG:
```html
    <defs>
      <clipPath id="reveal"><rect id="reveal-rect" x="56" y="0" width="0" height="520"></rect></clipPath>
    </defs>
    <g clip-path="url(#reveal)">
      <path id="line-filed62"></path>
      <path id="line-waiting"></path>
      <path id="line-collecting"></path>
    </g>
    <g id="playhead-layer">
      <line id="playhead" x1="56" x2="56" y1="40" y2="470"></line>
      <circle id="ph-handle" cx="56" cy="470" r="9"></circle>
      <g id="flash-70" opacity="0">
        <circle id="flash-dot" r="10"></circle>
        <text id="flash-text" text-anchor="middle">Age 70 — delayed credits maxed. Now it's pure COLA.</text>
      </g>
    </g>
```
Below the `#legend` div, still inside `#chart`:
```html
  <div id="drag-hint" hidden>&larr; drag the line to any age &rarr;</div>
```

Styles:
```css
  #playhead { stroke: #9ca3af; stroke-width: 2; }
  #ph-handle { fill: #6b7280; stroke: #fff; stroke-width: 2; cursor: ew-resize; }
  #ph-handle.ready { fill: #2563eb; }
  #ph-handle.pulse { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { r: 9; } 50% { r: 13; } }
  #flash-70 text { fill: #047857; font-size: 18px; font-weight: 700; }
  #flash-dot { fill: #34d399; }
  .flash-on { animation: flash 1.6s ease-out; }
  @keyframes flash { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; } }
  #drag-hint { text-align: center; color: #6b7280; font-size: 14px; margin-top: 6px; }
  @media (prefers-reduced-motion: reduce) { #ph-handle.pulse { animation: none; } }
```

- [ ] **Step 2: Write the failing verification**

`javascript_tool`:
```js
// reset & start
window.WaitingGame.runSweep();
const w0 = document.getElementById('reveal-rect').getAttribute('width');
await new Promise(r => setTimeout(r, 1500));
const w1 = document.getElementById('reveal-rect').getAttribute('width');
JSON.stringify({ grew: Number(w1) > Number(w0), w0, w1 });
```
Expected now: `runSweep` undefined.

- [ ] **Step 3: Implement the sweep**

```js
  const SWEEP_MS = 10000;
  const playhead = svg.querySelector('#playhead');
  const phHandle = svg.querySelector('#ph-handle');
  const revealRect = svg.querySelector('#reveal-rect');
  const flash = svg.querySelector('#flash-70');
  const dragHint = document.getElementById('drag-hint');
  let sweepRaf = 0, flashed = false;

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function movePlayhead(age) {
    const x = xScale(age);
    playhead.setAttribute('x1', x); playhead.setAttribute('x2', x);
    phHandle.setAttribute('cx', x);
    revealRect.setAttribute('width', Math.max(0, x - PLOT.x0));
  }

  function fireFlash() {
    const x = xScale(70), y = yScale(currentSeries.at70);
    flash.querySelector('#flash-dot').setAttribute('cx', x);
    flash.querySelector('#flash-dot').setAttribute('cy', y);
    const t = flash.querySelector('#flash-text');
    t.setAttribute('x', Math.min(x, PLOT.x1 - 220));
    t.setAttribute('y', y - 24);
    flash.classList.remove('flash-on'); void flash.getBBox();
    flash.setAttribute('opacity', '1'); flash.classList.add('flash-on');
    setTimeout(() => flash.setAttribute('opacity', '0'), 1600);
  }

  function finishSweep() {
    cancelAnimationFrame(sweepRaf); sweepRaf = 0;
    revealRect.setAttribute('width', PLOT.x1 - PLOT.x0);
    setAge(currentAge);
    phHandle.classList.add('ready', 'pulse');
    dragHint.hidden = false;
    if (typeof enableDrag === 'function') enableDrag();
  }

  function runSweep() {
    cancelAnimationFrame(sweepRaf);
    flashed = false;
    phHandle.classList.remove('ready', 'pulse');
    dragHint.hidden = true;

    if (prefersReducedMotion()) {
      currentAge = AGE_MIN;
      finishSweep();
      return;
    }

    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / SWEEP_MS);
      const age = AGE_MIN + p * (AGE_MAX - AGE_MIN);
      currentAge = Math.round(age);
      movePlayhead(age);
      updateLegend(currentAge);
      if (!flashed && age >= WAIT_MAX) { flashed = true; fireFlash(); }
      if (p < 1) { sweepRaf = requestAnimationFrame(tick); }
      else { finishSweep(); }
    };
    sweepRaf = requestAnimationFrame(tick);
  }

  runSweep();
```

Add `runSweep`, `movePlayhead` to `window.WaitingGame`. Update `getState` (add in this task if not present):
```js
  const getState = () => ({ currentAge, mode: currentMode });
```
Add near the constants: `let currentMode = 'single';` (used fully in Task 6). Add `getState` to `window.WaitingGame`.

- [ ] **Step 4: Run the verifications**

Re-run Step 2 → expect `{ "grew": true, ... }`.

Then test reduced motion: `mcp__Claude_Browser__javascript_tool`:
```js
JSON.stringify({ note: 'set emulation next' });
```
Use `mcp__Claude_Browser__resize_window` is not it — instead emulate via CDP is unavailable; verify reduced-motion logic directly:
```js
const orig = window.matchMedia;
window.matchMedia = (q) => q.includes('reduced-motion')
  ? { matches: true, addListener(){}, removeListener(){} } : orig(q);
window.WaitingGame.runSweep();
const r = {
  full: document.getElementById('reveal-rect').getAttribute('width'),
  ready: document.getElementById('ph-handle').classList.contains('ready'),
  hintShown: !document.getElementById('drag-hint').hidden,
};
window.matchMedia = orig;
JSON.stringify(r);
```
Expected: `full` ≈ `904` (960−56), `ready` true, `hintShown` true.

Take a screenshot mid-sweep (start `runSweep()`, wait ~5s, screenshot) to confirm the playhead sits mid-chart with lines drawn only to its left, and a second screenshot after 11s showing the full chart + pulsing handle.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "feat: 10s sweep animation with progressive reveal and age-70 flash"
```

---

### Task 5: Draggable playhead

**Files:**
- Modify: `/Users/kurtzahner/New 62-70 Benefit App/index.html`

**Interfaces:**
- Consumes: `xScale`, `PLOT`, `setAge`, `phHandle`, `svg`, `movePlayhead`, `runSweep`, `finishSweep` from earlier tasks.
- Produces:
  - `enableDrag()` — attaches `pointerdown`/`pointermove`/`pointerup` (mouse + touch) to `#ph-handle` and the SVG. Idempotent (removes prior listeners first). Converts client X → SVG user X → nearest whole age (clamped 62..95) → `setAge(age)`. Lines are **not** re-truncated during drag (the reveal rect stays full-width).
  - `ageFromClientX(clientX:number) => number` — helper.
  - `sweepComplete` module flag (init `false`) that freezes the reveal after the sweep.

- [ ] **Step 0: Freeze the reveal after the sweep (`sweepComplete` flag)**

`movePlayhead` currently writes `#reveal-rect` width on every call, so a
post-sweep drag would re-truncate the lines — spec §6 says it must not. Gate it:

1. Add a module var next to `sweepRaf`: `let sweepComplete = false;`
2. In `movePlayhead`, wrap only the reveal write:
   ```js
   function movePlayhead(age) {
     const x = xScale(age);
     playhead.setAttribute('x1', x); playhead.setAttribute('x2', x);
     phHandle.setAttribute('cx', x);
     if (!sweepComplete) revealRect.setAttribute('width', Math.max(0, x - PLOT.x0));
   }
   ```
3. At the top of `runSweep()` (with the other resets): `sweepComplete = false;`
4. In `finishSweep()`, set `sweepComplete = true;` as the **first** line (before
   `setAge(currentAge)`). Keep the explicit
   `revealRect.setAttribute('width', PLOT.x1 - PLOT.x0);` that follows — with the
   flag set, that line is now the only thing driving the reveal to full width on
   both the normal and reduced-motion exits.

- [ ] **Step 1: Write the failing verification**

`javascript_tool`:
```js
window.WaitingGame.__forceFinish && window.WaitingGame.__forceFinish();
const rectW = document.getElementById('reveal-rect').getAttribute('width');
const svgEl = document.querySelector('#chart svg');
const box = svgEl.getBoundingClientRect();
// simulate a drag to ~age 80
const xForAge = (age) => box.left + ((age - 62) / (95 - 62)) * box.width;
function pd(x){ svgEl.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:box.top+box.height-10,bubbles:true,pointerId:1})); }
function pm(x){ window.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:box.top+box.height-10,bubbles:true,pointerId:1})); }
function pu(x){ window.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:box.top+box.height-10,bubbles:true,pointerId:1})); }
document.getElementById('ph-handle').dispatchEvent(new PointerEvent('pointerdown',{clientX:xForAge(62),clientY:box.top,bubbles:true,pointerId:1}));
pm(xForAge(80)); pu(xForAge(80));
JSON.stringify({
  age: window.WaitingGame.getState().currentAge,
  rightLabel: document.getElementById('lg-right-label').textContent,
  revealUnchanged: document.getElementById('reveal-rect').getAttribute('width') === rectW,
});
```
Expected now: age stays 62 (no drag wired).

- [ ] **Step 2: Implement `enableDrag`**

```js
  let dragActive = false;
  let dragCleanup = null;

  function ageFromClientX(clientX) {
    const box = svg.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;      // 0..1 across the SVG
    const userX = ratio * 1000;                          // viewBox is 0..1000
    const age = AGE_MIN + ((userX - PLOT.x0) / (PLOT.x1 - PLOT.x0)) * (AGE_MAX - AGE_MIN);
    return Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(age)));
  }

  function enableDrag() {
    if (dragCleanup) dragCleanup();
    const down = (e) => { dragActive = true; e.preventDefault(); setAge(ageFromClientX(e.clientX)); };
    const move = (e) => { if (dragActive) setAge(ageFromClientX(e.clientX)); };
    const up = () => { dragActive = false; };
    phHandle.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    dragCleanup = () => {
      phHandle.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }
```
Add `enableDrag` and, for tests, `__forceFinish: finishSweep` to `window.WaitingGame`.
Add `touch-action: none;` to `#ph-handle` in CSS so touch drags don't scroll the page.

- [ ] **Step 3: Run the verification**

Re-run Step 1. Expected:
```json
{ "age": 80, "rightLabel": "Your check", "revealUnchanged": true }
```
`revealUnchanged: true` is the Step 0 flag working — the drag moved the playhead
but the reveal rect stayed at full width. Also drag to age 66 and assert
`rightLabel` is `"If you claim at 66"`, the right value class is `amt neg`, and
`#reveal-rect` width is still unchanged (lines still fully drawn).

- [ ] **Step 4: Manual pointer check via browser tools**

After `__forceFinish()`, use `mcp__Claude_Browser__computer` to `left_click_drag` from the handle position to roughly 1/3 across the chart; screenshot; confirm the playhead followed and the legend updated.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "feat: draggable playhead after the sweep (mouse + touch)"
```

---

### Task 6: Single / Married toggle

**Files:**
- Modify: `/Users/kurtzahner/New 62-70 Benefit App/index.html`

**Interfaces:**
- Consumes: `computeSeries`, `buildChart`, `runSweep`, `currentMode` from earlier tasks.
- Produces:
  - `setMode(mode:'single'|'married')` — sets `currentMode`, `buildChart(computeSeries(mode))`, resets `currentAge=62`, re-runs `runSweep()`, updates the toggle's pressed state.
  - Toggle markup: two `<button>`s in a segmented control, `#mode-single` / `#mode-married`, `aria-pressed` reflecting state.

- [ ] **Step 1: Add toggle markup + styles**

Directly after the `<p class="sub">…</p>` line:
```html
  <div id="mode-toggle" role="group" aria-label="Household">
    <button id="mode-single" type="button" aria-pressed="true">Single</button>
    <button id="mode-married" type="button" aria-pressed="false">Married</button>
  </div>
```
Styles:
```css
  #mode-toggle { display: inline-flex; margin-bottom: 14px; border: 1px solid #d1d5db; border-radius: 999px; overflow: hidden; }
  #mode-toggle button { border: 0; background: #fff; padding: 7px 18px; font: inherit; font-weight: 600; color: #6b7280; cursor: pointer; }
  #mode-toggle button + button { border-left: 1px solid #d1d5db; }
  #mode-toggle button[aria-pressed="true"] { background: #16a34a; color: #fff; }
```

- [ ] **Step 2: Write the failing verification**

`javascript_tool`:
```js
window.WaitingGame.setMode('married');
window.WaitingGame.__forceFinish();
const s = window.WaitingGame.computeSeries('married');
const near = (a,b) => Math.abs(a-b) <= 3;
window.WaitingGame.setAge(62);
JSON.stringify({
  leftVal: document.getElementById('lg-left-value').textContent,   // expect $4,150
  singlePressed: document.getElementById('mode-single').getAttribute('aria-pressed'),
  marriedPressed: document.getElementById('mode-married').getAttribute('aria-pressed'),
  seriesOk: near(s.filed62[0], 4150) && near(s.collecting[25], 16606),
});
```
Expected now: `setMode` undefined.

- [ ] **Step 3: Implement `setMode` + wire buttons**

```js
  const btnSingle = document.getElementById('mode-single');
  const btnMarried = document.getElementById('mode-married');

  function setMode(mode) {
    currentMode = mode === 'married' ? 'married' : 'single';
    btnSingle.setAttribute('aria-pressed', String(currentMode === 'single'));
    btnMarried.setAttribute('aria-pressed', String(currentMode === 'married'));
    currentAge = AGE_MIN;
    buildChart(computeSeries(currentMode));
    runSweep();
  }

  btnSingle.addEventListener('click', () => setMode('single'));
  btnMarried.addEventListener('click', () => setMode('married'));
```
Add `setMode` to `window.WaitingGame`.

- [ ] **Step 4: Run the verification**

Re-run Step 2. Expected:
```json
{ "leftVal": "$4,150", "singlePressed": "false", "marriedPressed": "true", "seriesOk": true }
```
Screenshot married mode: the y-axis should have rescaled (lines occupy a similar height because `yMax` doubled too) and every legend figure doubled. Toggle back to Single and confirm it re-runs.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "feat: single/married toggle rescales and replays"
```

---

### Task 7: Replay button, color key, responsive reflow, copy, README polish

**Files:**
- Modify: `/Users/kurtzahner/New 62-70 Benefit App/index.html`
- Modify: `/Users/kurtzahner/New 62-70 Benefit App/README.md` (only if assumptions changed — otherwise leave)

**Interfaces:**
- Consumes: `runSweep` from Task 4.
- Produces:
  - `#replay` button that calls `runSweep()`.
  - `#key` color-key line below the chart.
  - A `<640px` layout: `#legend` becomes static (flows below the SVG, full width, side-by-side cells) instead of absolutely positioned.

- [ ] **Step 1: Add footer markup**

After `#chart` closes (inside `.wrap`):
```html
  <div id="footer">
    <button id="replay" type="button">&#8635; Replay</button>
    <p id="key">
      <span class="sw sw-f62"></span> filed at 62 &nbsp;·&nbsp;
      <span class="sw sw-wait"></span> what waiting earns you &nbsp;·&nbsp;
      <span class="sw sw-coll"></span> your check from 70 on
    </p>
  </div>
```
Styles:
```css
  #footer { margin-top: 14px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  #replay { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 8px 16px; font: inherit; font-weight: 600; cursor: pointer; }
  #replay:hover { background: #f9fafb; }
  #key { margin: 0; color: #6b7280; font-size: 14px; }
  #key .sw { display: inline-block; width: 22px; height: 0; vertical-align: middle; margin-right: 4px; }
  #key .sw-f62  { border-top: 3px solid #86efac; }
  #key .sw-wait { border-top: 3px dotted #9ca3af; }
  #key .sw-coll { border-top: 5px solid #16a34a; }
  @media (max-width: 640px) {
    body { padding: 14px; }
    #legend { position: static; margin: 8px 0 0; width: 100%; }
    #legend .cell { flex: 1; }
    #drag-hint { margin-top: 10px; }
  }
```

- [ ] **Step 2: Wire replay**

```js
  document.getElementById('replay').addEventListener('click', () => runSweep());
```

- [ ] **Step 3: Verify**

`javascript_tool`:
```js
document.getElementById('replay').click();
await new Promise(r => setTimeout(r, 800));
const w = Number(document.getElementById('reveal-rect').getAttribute('width'));
JSON.stringify({ replayed: w > 0 && w < 904, keyText: document.getElementById('key').textContent.replace(/\s+/g,' ').trim() });
```
Expected: `replayed` true; key text contains "filed at 62 · what waiting earns you · your check from 70 on".

Then `mcp__Claude_Browser__resize_window` `{ preset: "mobile" }`, reload, screenshot. Confirm: no horizontal page scroll, legend sits below the chart full-width, chart still readable. Reset with `{ preset: "desktop" }`.

- [ ] **Step 4: Final copy pass**

Review the visible strings against the spec (title, subtitle, flash label, legend labels, key, drag hint). Adjust wording for tone only — do not change any number or the red/green rules. If the owner has given no new copy, keep the strings already in place.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "feat: replay button, color key, mobile reflow"
```

---

### Task 8: End-to-end verification pass

**Files:** none (verification only; fixes go back into `index.html` under this task).

- [ ] **Step 1: Fresh load, full sweep**

`navigate` to the `file://` URL. Do not touch anything for 11 seconds. Screenshot. Confirm: sweep ran once, playhead ended at 95, handle pulsing, drag hint visible, legend right cell green ("Your check", ~$8,303).

- [ ] **Step 2: Console + network clean**

`mcp__Claude_Browser__read_console_messages` `{ onlyErrors: true }` → expect none.
`mcp__Claude_Browser__read_network_requests` → expect only the document itself (no font/CDN/XHR).

- [ ] **Step 3: Drag sweep 62→95 checking key ages**

For ages `[62, 66, 69, 70, 75, 90, 95]`, call `window.WaitingGame.setAge(age)` and read both legend values. Assert against the canonical table (±2) and the label/colour rules (`< 70` → "If you claim at N" red; `>= 70` → "Your check" green).

- [ ] **Step 4: Married pass**

`setMode('married')`, `__forceFinish()`, repeat Step 3 with doubled expectations.

- [ ] **Step 5: Reduced-motion pass**

Re-run the reduced-motion snippet from Task 4 Step 4. Confirm no sweep, full chart, immediate draggable handle.

- [ ] **Step 6: Serve check**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App" && python3 -m http.server 8123 &
```
`navigate` to `http://localhost:8123/` — confirm identical behaviour to `file://`. Stop the server.

- [ ] **Step 7: Commit any fixes + tag**

```bash
cd "/Users/kurtzahner/New 62-70 Benefit App"
git add -A && git commit -m "test: end-to-end verification pass" --allow-empty
git tag v0.1.0
```

---

## Self-Review

**Spec coverage:**
- §2 single file / no external requests → Task 1 (scaffold, system fonts), Task 8 Step 2 (network check). ✓
- §3 assumptions (PIA, COLA, factors, ×2) → Task 1 constants + `computeSeries`; Global Constraints. ✓
- §4 three lines + continuity at 70 → Task 2 (`buildChart`), Task 1 (`at70`). ✓
- §4.1 reference values → "Canonical reference values" table + assertions in Tasks 1, 3, 8. ✓
- §5 animation, progressive reveal, flash at 70, drag affordance on completion → Task 4. ✓
- §6 draggable playhead, lines stay drawn, Replay, toggle re-runs → Tasks 5, 7 (replay), 6 (toggle). ✓
- §7 legend columns + red/green rules → Task 3. ✓
- §8 axes (62/70/95, no years, no y-numbers), toggle placement, color key below → Tasks 2, 6, 7. ✓
- §9 inline SVG + rAF, pointer drag, viewBox responsive, `prefers-reduced-motion` → Tasks 2, 4, 5, 7. ✓
- §10 out of scope — nothing in the plan adds email/DB/among others. ✓
- §11 open items (copy, easing, married re-run vs instant) → Task 7 Step 4 (copy), Task 6 (married re-runs — decision locked). ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step has real code. Reduced-motion, clamping, and idempotent listeners are all spelled out.

**Type consistency:** `computeSeries` shape is used identically in Tasks 2/3/6. `setAge`/`updateLegend`/`movePlayhead`/`runSweep`/`finishSweep`/`enableDrag`/`setMode` names are consistent across tasks and the `window.WaitingGame` surface. `currentMode` introduced in Task 4, consumed in Task 6. `__forceFinish` alias introduced in Task 5, used in Tasks 6 and 8.

One note for the implementer: `movePlayhead` is referenced by `setAge` (Task 3) before it is defined (Task 4) — the `typeof movePlayhead === 'function'` guard in `setAge` handles the interim; once Task 4 lands the guard is always true.
