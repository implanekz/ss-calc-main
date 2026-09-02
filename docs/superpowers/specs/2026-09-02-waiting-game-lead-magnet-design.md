# The Waiting Game — 62→70 Benefit Lead Magnet

**Date:** 2026-09-02
**Status:** Approved design, pre-implementation
**Working title:** "The Waiting Game" (copy not final)

## 1. Purpose

A standalone, self-contained illustration that dramatizes the payoff of claiming
Social Security one year at a time instead of filing at 62. The framing is a
game: you can quit at any age, or wait one more year. Most people file at 62 —
they quit the game before it starts. The visual makes the forgone income
obvious.

This is the first iteration of a lead magnet. Email gating and persistence are
explicitly out of scope now (see §10) and will be layered on later.

## 2. Deliverable

- A single file: `/Users/kurtzahner/New 62-70 Benefit App/index.html`
  - All HTML, CSS, and JS inline. No build step. No external requests, no CDN,
    no fonts fetched over the network (system font stack).
  - Opens correctly from `file://` and from a static server.
- A short `README.md` in the same folder: what it is, how to open it, the baked
  assumptions, and what is deliberately omitted.
- This spec, committed to the repo. The app itself lives outside the repo.

Not wired into the React calculator app in any way.

## 3. Baked-in assumptions

All figures are **illustrative and non-specific**. No calendar years appear
anywhere in the UI.

> **Revision 2026-09-02 (post-implementation):** `$2,075` is the **PIA (the
> full-retirement-age benefit)**, not the age-62 check. The age-62 filer
> receives 70% of it ≈ **$1,453**. Earlier drafts of this spec treated
> `$2,075` as the age-62 amount and back-derived a `$2,964` PIA; that is
> superseded. Because the change is a uniform 0.70 scaling of every line, the
> animation and chart geometry are unchanged — only the dollar figures move.

| Assumption | Value | Notes |
|---|---|---|
| PIA at FRA 67 | **$2,075** | illustrative round figure; the FRA benefit |
| Age-62 monthly check | **≈ $1,453** | 70% of PIA — the FRA-67 early-filing reduction |
| FRA | **67** | born 1960 or later |
| COLA | **2.5% / year** | compounds every year from age 62 onward, including years before the person claims |
| Chart age range | **62 to 95** | fixed, not adjustable |
| Married | every dollar figure **× 2** | two identical earners waiting together |

SSA age-adjustment factors (FRA 67), applied to PIA:

| Age | 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70 |
|---|---|---|---|---|---|---|---|---|---|
| Factor | 0.700 | 0.750 | 0.800 | 0.86667 | 0.93333 | 1.000 | 1.080 | 1.160 | 1.240 |

## 4. The three lines

Let `Y` = age, `pia = 2075`, `cola(Y) = 1.025^(Y - 62)`.

| Line | Visual | Value at age `Y` | Age span |
|---|---|---|---|
| **Filed at 62** | solid, light/thin green, gentle slope | `pia * 0.70 * cola(Y)` | 62 → 95 |
| **Waiting (accrual)** | dotted gray, steep rise | `pia * factor(Y) * cola(Y)` | 62 → 70 |
| **Collecting from 70** | solid, bold green | `(pia * 1.24 * cola(70)) * 1.025^(Y - 70)` | 70 → 95 |

Both solid lines are green (both are Social Security income), but must be
clearly distinguishable — the filed-at-62 line is lighter and thinner, the
collecting line is bold and saturated. This follows the owner's sketch.

The waiting line and the collecting line are continuous at age 70
(≈ $3,135/mo single). The waiting line is drawn from 9 yearly points (62–70)
connected by straight segments.

### 4.1 Reference values (single earner, rounded)

| Age | Filed at 62 | Waiting / Collecting |
|---|---|---|
| 62 | $1,453 | $1,453 |
| 63 | $1,489 | $1,595 |
| 64 | $1,526 | $1,744 |
| 65 | $1,564 | $1,937 |
| 66 | $1,603 | $2,138 |
| 67 | $1,643 | $2,348 |
| 68 | $1,684 | $2,599 |
| 69 | $1,727 | $2,862 |
| 70 | $1,770 | $3,135 |
| 75 | $2,002 | $3,547 |
| 80 | $2,265 | $4,013 |
| 85 | $2,563 | $4,540 |
| 90 | $2,900 | $5,137 |
| 95 | $3,281 | $5,812 |

`at70` (junction where the dotted line meets the green line) = **$3,134.95**.

Married = every value doubled. These are the numbers the finished app must
reproduce (±$2 rounding); they are computed directly from the formulas in §4,
not from the calculator app's projection engine. The repo's dev-only
`verify.mjs` asserts this table.

## 5. Animation (on load)

- Duration: **~10 seconds**, steady rate (~2.5s per decade of age).
- A thin vertical gray line (the playhead) starts at age 62 and sweeps right to
  age 95.
- All three lines reveal progressively — only the portion to the left of the
  playhead is drawn at any moment.
- **At age 70:** a brief flash / glow on the playhead and on the dotted→green
  junction, plus a one-time transient label near that point (e.g. "Age 70 —
  delayed credits maxed. From here it's pure COLA."). The sweep does **not**
  pause.
- On reaching age 95: the full chart is shown. The playhead gains a visible
  drag affordance (grip handle + subtle pulse) and a caption appears: "Drag the
  line to any age."

## 6. After the animation

- The playhead becomes draggable along the x-axis, ages 62 ↔ 95, snapping to
  whole years. It stays where released until dragged again.
- The three lines remain fully drawn. Dragging updates only the playhead
  position and the legend numbers — lines do not re-truncate.
- A **Replay** button re-runs the 10-second sweep from age 62.
- Toggling **Single / Married** rescales the y-axis to the new maximum and
  re-runs the 10-second animation.

## 7. Legend

A floating box in the upper-left area of the chart (drops below the chart on
narrow screens). Two columns, both driven by the playhead's current age.

| Column | Playhead age | Label | Number color | Value |
|---|---|---|---|---|
| Left | any | "Filed at 62" | red | filed-at-62 line at playhead age |
| Right | 62–69 | "If you claim at *N*" (*N* updates) | red | waiting line at playhead age |
| Right | 70–95 | "Your check" | green | collecting line at playhead age |

Note the deliberate contrast in the sketch: the on-chart lines are green, but
the legend numbers are red (the "you're leaving money behind" signal) until the
player passes 70, when the right number turns green.

No delta between the two numbers in v1 (see §10).

## 8. Axes and chrome

- **X-axis:** labelled ticks at **62** and **70**; a faint tick at 95. No
  calendar years anywhere.
- **Y-axis:** no numeric labels (illustrative). A baseline and at most 2–3 very
  faint horizontal gridlines. Lines originate at the $2,075 height, y-scale
  starts at 0.
- **Above the chart:** title, one-line subtitle, and the Single / Married
  toggle (segmented control).
- **Below the chart:** a one-line color key — "light green = filed at 62 ·
  dotted = what waiting earns you · bold green = your check from 70 on" — plus
  the Replay button and the drag caption.
- All copy is placeholder for the owner to refine later.

## 9. Technical approach

- **Inline SVG** for the chart, with a `requestAnimationFrame` loop driving the
  playhead x-position and the reveal of each line (via clip or
  progressively-built path).
- Playhead + drag handle are SVG elements; pointer events on them handle
  dragging with hit-testing. Support mouse and touch.
- `viewBox`-based responsive scaling; a media query reflows the legend below
  the chart under ~640px.
- No libraries. No network calls. Precomputed factor table and the three
  formulas from §4 are the entire data model — the ~34 yearly points per line
  are cheap to compute at runtime.
- Respect `prefers-reduced-motion`: skip the sweep, render the full chart
  immediately, playhead starts at 62 and is draggable right away.

## 10. Out of scope for v1

- Email gate, database, any persistence or analytics.
- Real per-user inputs (PIA, date of birth, actual earnings).
- Month-level granularity — the module it draws from is monthly, but this
  animation is yearly.
- A cumulative "winnings" counter or running total.
- Showing the dollar difference between the two legend numbers.
- Divorced / widowed / survivor variants.
- Spouses filing at different ages.
- Hosting / deployment decisions (localhost or a published artifact only, for
  review).

## 11. Open items (non-blocking, decide during build)

- Final title and body copy.
- Exact easing of the sweep and the flash treatment at 70.
- Whether Married toggling re-runs the full animation or redraws instantly
  (leaning re-run for impact).
