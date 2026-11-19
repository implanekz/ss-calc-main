# Next Up — Lifelong Navigator

A running list of changes we still have to make. Newest decisions first within each section.
Last updated: 2026-09-23.

## 1. Features

### Save a user's scenarios (next build)
Today the app quietly remembers one set of inputs and overwrites it on every change. There is no
way to name, keep, switch between, or delete scenarios.

- Needs a "Save this scenario" action, a list of saved scenarios (open / rename / delete), and
  storage for more than one per person.
- The data side has a head start: `serializeScenario` / `deserializeScenario` / `planLabel` /
  `areScenariosComparable` in `frontend/src/calculators/showMeTheMoney/scenario.js`.
- Design and test with a hand-entered PIA only. Most users will never upload an earnings record.
- Naming decided 2026-08-13: the committed plan is "My Lifelong Plan" (single) or "Our Lifelong
  Plan" (married).
- Earlier idea: save each plan with an AI-written description (what they have, what
  opportunities remain, tradeoffs).
- To settle in design:
  - Where scenarios live: the account (works across devices) or this browser only.
  - Whether saving requires login.
  - How many scenarios a person can keep.
  - Whether side-by-side comparison is in the first version.
  - When COLA changes after saving, whether the saved scenario updates or is marked out of date.

### Carry a Divorced-calculator result into the main PIA
When the Divorced calculator produces a higher amount, ask whether to use it in the main app.
The PIA box then shows a reminder that the number came from the Divorced calculator, with a way
to switch back to the person's own PIA or earnings-record number.

- Builds on the per-person `piaSource` in `scenario.js` (it already tracks typed / PIA
  Calculator / earnings-record sources and shows a note in the PIA box).
- **Trap:** a divorced-spouse benefit is not a PIA. It gets no delayed credits after full
  retirement age, so copying it into the PIA field as a plain number would make the 70 bar
  overstate the payoff of waiting. Carry the benefit type with the number so the chart applies
  the right rules.
- The Divorced calculator already warns when the person's own PIA is better.
- **On hold:** the same transfer for the Widowed (survivor) and Disability calculators.

## 2. Design

- **Restyle the Divorced, Widowed, and Disability calculators** to match the new main app:
  `DivorcedCalculator.jsx`, `WidowCalculator.jsx`, `SSDICalculator.jsx`. Pull colors from
  `frontend/src/theme/navigatorColors.js` and the `ret1re` Tailwind colors. Keep the filing-age
  colors consistent, and keep stage bands and other context colors off those hues.
- Restyle the helper-app pages (Sequence of Returns, Longevity Spending, Income Target, Budget
  Worksheet, Start-Stop-Start, PIA Calculator, Life Expectancy). They have the new header but
  not the new content styling.
- Decide whether to switch the app's body font from Inter to the brand's Lato. This changes
  every page, so it's a deliberate decision.
- The Tailwind `primary` color is still the stock blue on pages not yet restyled.

## 3. Infrastructure and housekeeping

- **Around 2026-09-30:** if `api.ret1re.com` on Railway has had no problems, shut down the old
  server at `217.196.50.161`. Until then it's the fallback: point the Cloudflare `api` record
  back to A / `217.196.50.161` to revert.
- Test a logged-in save of an earnings record against the new backend. It wasn't tested at
  cutover.
- Delete or fix the Railway projects `abundant-spirit` and `zooming-adventure`. They crash on
  every deploy (they build from the repo-root Dockerfile, which has no `main.py`) and serve
  nothing.
- Restrict which websites may call the API (`ALLOWED_ORIGINS` on Railway `renewed-charm`).
  First confirm every address users open the calculator at.
- Database migrations are manual: every new file in `backend/migrations/` must be run in the
  Supabase SQL editor before (or with) the deploy that needs it.
- Two backend tests fail on `main`: `test_life_expectancy_is_merged_into_calculator_states` and
  `test_realistic_record_produces_differing_pias_across_stop_ages`.
- Uncommitted local work to finish or discard: One Month at a Time filing selection
  (`OneMonthAtATimeModal.jsx`, `OneMonthAtATime/filingSelection.js` + test, and four props at the
  bottom of `ShowMeTheMoneyCalculator.jsx`).
- A git stash holds backup copies of `RetirementIncomeNeedsApp` files that are identical to
  `main`. It's safe to drop.
