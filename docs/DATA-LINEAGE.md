# Data lineage and sources of truth

Which representation of a number is authoritative, where each transformation happens, and where two representations currently compete. Keep this current — the failures it prevents are the ones where the app states something confidently and wrongly.

Status as of 2026-08-13, branch `codex-refactor-step-1`.

---

## 1. Earnings — six representations

A single year's earnings exists in six forms. Only one is the source of truth; the rest are derived and must never be written back up the chain.

| # | Representation | Where | Units | Authoritative for |
|---|---|---|---|---|
| 1 | Gross wages | never in the app | nominal | nothing |
| 2 | **Taxed SS earnings** | SSA XML `<Earnings>` | nominal, **already capped by SSA** | **SOURCE OF TRUTH** |
| 3 | Persisted rows | `earnings_records.rows` | nominal | durable copy of #2, plus user edits |
| 4 | Editable spreadsheet | `create_editable_spreadsheet()` | nominal | display + what-if editing |
| 5 | Projected rows | same, `is_projected: true` | nominal, assumed | forecasting only — **never a "banked" year** |
| 6 | Indexed earnings | `calculate_indexed_earnings()` | **AWI-year dollars** | AIME input only |

**#2 is the single source of truth for the entire system.** Every benefit figure the app shows — including SSA's own PIA estimate — is a derivation of it. See §2.

**Rules:**
- #2 arrives pre-capped. SSA's record reports *taxed* earnings, which never exceed that year's maximum. Re-capping real XML is redundant.
- #5 must be excluded from any count of years worked. This has already caused one shipped bug (`PIACalculator.jsx:467`, `:554` counted projected rows as earnings years, overstating a 21-year record as 25).
- #6 is in different units from #2. **Never compare an indexed value against a nominal cap.**

### ✅ Fixed 2026-08-30 — unit mismatch (cap-then-index)

`calculate_indexed_earnings()` used to cap **indexed** earnings against that year's **nominal** taxable maximum. A 1991 value indexed to 2024 dollars was compared against the 1991 ceiling. Observed in `backend/test_profile_pia2250_5zeros.xml`: 1991 nominal $24,024 indexes to $76,927, was capped to $53,400 — a person who earned less than half the cap was flagged `is_capped: True`.

Correct order is cap-then-index. Stored `earnings_records.rows` are nominal and did not need recomputation; any previously displayed PIA was computed live and corrects on the next calculate.

**Fixture deltas (buggy → fixed), same birth year / bend points:**

- `test_profile_pia2250_5zeros.xml` (born 1964, mid earner, 5 planted zeros): PIA $2,250.00 → $2,371.71 (+$121.71); AIME $4,700.36 → $5,080.70
- `sample_ssa_statement.xml` (born 1960, long high-earning career): PIA $2,847.77 → $3,284.53 (+$436.76); AIME $8,030.71 → $10,942.47
- `ssa_projection_pia2500_test.xml` / `_like.xml`: PIA $2,901.06 → $3,277.34 (+$376.28)
- `sample_ssdi_earnings.xml` (born 1963): PIA $3,057.88 → $3,192.58 (+$134.70)
- Synthetic max-taxable career, born 1966 (39 years at each year's ceiling): PIA $4,215.56 after the fix (AWI for 2026 unpublished; `awi_approximated: true`)

The understatement was worst for the longest / highest careers (largest indexing factors). Regression coverage: `backend/tests/test_indexed_earnings_cap.py`.

---

## 2. PIA — never a source, always a derivation

**PIA is not a source of truth. The earnings record (§1) is.** Every PIA in this system is derived from it — the only differences are *who* ran the derivation and *under what assumption about future earnings*.

This matters because users do not experience it that way. A user does not invent their PIA; they copy SSA's figure off their statement. To them it reads as a fact they can rely on. It is actually a projection resting on an assumption they were never shown.

| Derivation | Channel | Assumption baked in | Currently drives |
|---|---|---|---|
| **A. SSA's, hand-copied** | user types it at onboarding → `profiles.pia_at_fra` | you keep earning at your current rate until FRA | **the chart** |
| **B. SSA's, parsed** | XML `<EstimatedPIA>` → `ssaPIA` | identical to A — same number, different channel | PIA Calculator comparison |
| **C. Ours** | `calculate_aime_and_pia()` → `calculatedResult.pia` | whatever the user sets in the editable spreadsheet | PIA Calculator display only |

A and B are **the same derivation**, not competing sources. Treat a disagreement between them as a transcription error, not a modelling question.

**Today the chart runs on A** (profile sync, `ShowMeTheMoneyCalculator.jsx:1883`). C exists but never leaves the PIA Calculator — there is no `updateProfile` call — which is why the banner says "Earnings Record On File" and states outright that chart amounts still come from the entered PIA. **Any copy claiming the chart reflects the earnings record is false until Plan A changes that.**

### The product thesis this implies

What we tell the user is: *the number on your statement is an estimate resting on an assumption. Your earnings record is the underlying fact. Here is what it produces under assumptions you control.*

So Plan A is not "replace their number with ours." It is "show them that their number was always a derivation, and hand them the controls."

### A ≠ C is usually NOT an error — and that distinction is load-bearing

When our PIA differs from the statement figure, there are two entirely different causes and they must never be conflated:

- **Different assumptions → the numbers SHOULD differ.** SSA assumed continued earnings to FRA; the user told us they stop at 63. A lower number is the correct answer and is the entire value of the product.
- **Same assumptions → they MUST match.** Any gap is a defect in our engine (see the §1 indexing-cap defect, which understates PIA and would masquerade as an assumption difference).

**Therefore any validation must control for the assumption.** To check our engine against SSA, compute C *under SSA's own assumption* — earnings continuing at the current rate through FRA — and compare that to the statement figure. Comparing a stop-at-63 PIA against SSA's continue-to-FRA PIA proves nothing.

This also means user-facing copy must attribute a difference to the right cause. Telling someone their benefit is lower than their statement says, without naming the assumption that caused it, is alarming and unhelpful.

### The statement PDF (not ingested)

Use it as a **validation oracle, not a data source**: capture 2-3 typed numbers (benefit at FRA, family maximum, disability estimate) and compare against C computed under matched assumptions. Do not build a PDF parser — brittle, and storing statements would put SSN-bearing identity documents in the database, which `earnings_records` deliberately avoids (it holds neither name nor SSN).

---

## 3. Vintage — every input has an age, and we currently track none of it

A user may be reading a statement from last month or from 2019. Nothing in the app knows the difference.

| Input | Has a date? | Do we keep it? |
|---|---|---|
| Hand-typed PIA | **no date at all** | n/a — we cannot know its vintage |
| XML earnings record | yes — `<StatementDate>` (fallbacks `<AsOfDate>`, `<DateGenerated>`) | **no — extracted, then discarded** |
| `earnings_records.created_at` | yes | when they *uploaded*, not when SSA *generated* |

### 🔴 Defect — statement date is parsed and thrown away

`ssa_xml_processor.py:109-120` extracts the statement date and comments that it is "critical for AWI accuracy." Migration 005 has no column for it and `EarningsRecordOut` does not carry it. `created_at` is not a substitute — someone can upload a three-year-old statement today.

**Plan A must add `statement_date` to `earnings_records` and thread it through the API.** Without it we cannot tell a user their record is stale, and cannot reason about what is missing from it.

### The XML is self-dating — which is a second reason it outranks the PIA

The XML carries the date SSA generated it. A hand-typed PIA carries nothing and never can. So the earnings record is authoritative not only because everything derives from it (§2), but because **it is the only input whose vintage we can actually know.**

The remedy for a stale record is cheap: send the user back to download a fresh one. They already know where it is — it sits directly beneath the statement link on the same SSA page.

### But file vintage and data completeness are two different signals

Do not collapse them. They have different remedies, and confusing them sends users on pointless errands:

| Signal | Computed from | Meaning |
|---|---|---|
| **File vintage** | `today − statement_date` | how old the download is |
| **Data gap** | `(current year − 1) − last earnings year` | how many recent years are missing |

SSA's earnings posting lags — employers file W-2s in January and posting takes months — so **a file generated today can legitimately still be missing last year's earnings.**

- Old file **and** a gap → re-downloading will help. Prompt for it.
- Fresh file **and** a gap → SSA has not posted yet. Re-downloading will not help. Explain the lag instead.

Telling someone their record is stale when SSA simply has not posted their most recent year sends them on a wasted trip and erodes trust in every other number we show.

Note: `backend/sample_ssa_statement.xml` (generated 2024-10-01, earnings through 2024) and `sample_ssdi_earnings.xml` (generated 2025-01-15, earnings through 2024) are synthetic and model this lag unrealistically. `backend/test_profile_pia2250_5zeros.xml` (generated 2026-08-01, earnings through 2025) is realistic. Do not calibrate staleness logic against the first two.

### Staleness always biases the same direction: understated

Both stale inputs understate, for two independent reasons:

1. **Missing recent earnings years.** Each absent year is a year that could displace a zero or a low year in the top 35. `test_profile_pia2250_5zeros.xml` has 5 zero years among its own 35 raw rows — but verified live through the actual upload → pad → project → calculate pipeline, only **1** lands in the real top 35 (PIA $2,412.70, AIME $5,208.80, `years_of_zero_in_top_35: 1`), because the four carried-forward projected years (2027-2030 at $53,386) are positive and fill four of the five gaps. The fifth is filled by 2026 itself — the fixture's career ends in 2025, so 2026 arrives at the live pipeline as a same-year posting-lag zero, not one of the 5 planted ones. This is a live demonstration of exactly this section's point: the *raw record's* zero count is not the same as the *actual top-35* zero count once padding and projection run. Report the calculated number, never the raw or algebraic one — see the fix in `PIACalculator.jsx`'s double-hit block, which made this same mistake before being corrected.
2. **Missing COLAs.** SSA states estimates in the dollars of the statement year. A figure copied from a 2023 statement has not been adjusted for the COLAs since.

So when our number comes out *higher* than what the user typed, a stale statement is a leading explanation — and a benign one. This is a third cause of A ≠ C, alongside the assumption difference and engine defects in §2, and it must not be conflated with either.

### Our own reference data is stale too, on the young end of the audience

The indexing year is `birth_year + 60`. AWI for year *N* is not published until autumn of *N+1*, so anyone turning 60 this year or later has no AWI for their indexing year. `calculate_indexed_earnings()` falls back to `max(AVERAGE_WAGE_INDEX.values())` — a reasonable approximation, but silent.

This lands on the youngest slice of the 58+ audience: someone born 1966 indexes to 2026, which will not exist until late 2027. Their PIA is approximate and they are not told. Worth surfacing rather than hiding.

---

## 4. Birth year — four sources, silently racing

| Source | Where |
|---|---|
| **Profile DOB** | `profiles.date_of_birth` → `spouse1Dob` — **SOURCE OF TRUTH** |
| XML `<BirthDate>` | overwrites local `birthYear` in `PIACalculator` on upload |
| Inferred | `earliest earnings year − 18` when XML has no birth date |
| `resolvedBirthYear` | local, `PIACalculator.jsx:406` |

`resolvedBirthYear` exists because `setBirthYear()` is async and the closure value is stale within the same upload handler — persisting the stale one would have written a wrong birth year and corrupted every downstream PIA.

**Risk:** the inferred value is a guess that can silently disagree with the profile DOB, and eligibility year (`birth_year + 62`) selects the bend points. A wrong birth year moves every number. Plan A should reconcile these and surface a conflict rather than let the last writer win.

---

## 5. Derived counts — duplicated logic

"Zero years in top 35" is computed two different ways:
- `PIACalculator.jsx` table: algebraically, `35 − nonZeroYears`
- Upload toast: a real sort of the top 35 and a count

They agree today. They can diverge. Pick one and share it.

Note `hasThirtyFiveNonZeroYears()` (`scenario.js:137`) counts non-projected rows across the **whole record**, not the top 35 by indexed value. It is sound only because it is ANDed with `PIA(62) === PIA(70)`. Do not reuse it standalone.

---

## 6. SSA constants — one duplication remains

| Table | Location | Duplicated? |
|---|---|---|
| PIA bend points | `ssa_xml_processor.py` | no |
| Family-max bend points | `ssa_xml_processor.py` | no (unused so far) |
| AWI series | `ssa_xml_processor.py` | no |
| **Taxable maximum** | `ssa_xml_processor.py` **and** `frontend/src/utils/taxableMaximum.js` | **YES** |
| FRA lookup | `benefitFormulas.js` | no (statutory, fixed) |

The taxable-max duplication already drifted once: the backend was updated to 2026 ($184,500) while the frontend still capped at 2025 ($176,100), so the UI would have flagged legitimate 2026 earnings as over-cap. Fixed in `9cc7895`, but the duplication remains. Generate one from the other.

Both lookups **silently fall back to the most recent year** on a miss, which is how a stale table produces plausible wrong numbers instead of an error. Sources and the annual cadence are in the file headers.

---

## 7. Benefit — the chain after PIA

```
PIA (§2)
  → early-reduction / delayed-retirement credits   benefitFormulas.js
  → COLA to each future calendar year              calculateProjection()
  → household combination                          combineProjections()
  → survivor substitution on modeled death         combineProjections()
```

Each step is applied **exactly once**. The work-stop ladder deliberately returns **PIA, not a claimed benefit** — stopping work and filing are independent decisions, and folding DRCs into the ladder would double-count them downstream.

⚠️ The ladder's UI labels cells "PIA at FRA" but heads the block "What if you stop working at…" over ages **62 / 65 / 67 / 70** — the same four numbers that mean *claiming* ages everywhere else in the product. This has already caused a misreading. Fix the presentation.

---

## 8. Scenario assumptions

`scenario.assumptions` freezes `bendPointsYear` and `colaRate` at creation so a saved plan keeps reporting the tables it was computed under.

⚠️ `areScenariosComparable()` compares the **live** `inflation` field, not the frozen `colaRate`. They diverge as soon as the COLA slider moves (observed: `inflation 0.04` alongside `colaRate 0.025`). Nothing calls it yet. **Settle before the scenario-comparison chart**, or two scenarios computed under different assumptions will compare as if they matched.

---

## Adding a new transformation

1. Name the units. If they differ from the input, say so at the call site.
2. Never compare values across units (the §1 defect).
3. Mark derived values as derived; never write them back upstream.
4. If two sources can produce the same number, declare which wins and make the UI state it.
5. Update this file.
