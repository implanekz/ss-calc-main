# SSA Longevity Personalization and Timeline Flags — Design

Status: approved by Kurt, pending spec review  
Author: Kurt + Cursor (brainstorming session, 2026-08-31)  
Related:
- `frontend/src/components/LifeExpectancyCalculator.jsx`
- `frontend/src/components/OurLifelongTimeline/`
- `docs/superpowers/specs/2026-08-23-our-lifelong-timeline-design.md`
- `docs/superpowers/specs/2026-08-24-timeline-visual-refinements-design.md`

## Problem

The Life Expectancy module currently hardcodes 2022 CDC death probabilities for men and women from ages 60 through 105. It then applies one of 27 undocumented mortality multipliers chosen from smoking status, education, and self-rated health.

The three inputs are legitimate mortality predictors, but the existing multipliers have no cited source, derivation, calibration, or test coverage. The default profile applies a multiplier of `0.52`, cutting each baseline death probability almost in half. Results therefore should not be described as CDC or SSA estimates without qualification.

The module also calculates individual and couple survival thresholds independently from Our Lifelong Timeline. Users cannot see those planning ages next to the filing, income, and retirement-stage events that make the ages financially meaningful.

## Goals

1. Make the 2023 Social Security Administration period life table the canonical age-and-sex mortality baseline.
2. Preserve smoking, education, and self-rated health as personalization inputs, but replace the undocumented lookup with one fitted joint model.
3. Produce the same individual and household survival thresholds in the Life Expectancy module and Our Lifelong Timeline.
4. Teach the difference between headline life expectancy at birth and conditional longevity after reaching retirement age.
5. Plot individual and couple longevity probabilities as flags using the timeline's existing milestone language.

## Non-goals

- Predicting a person's date or age of death.
- Presenting a personalized result as an official SSA estimate.
- Copying or depending on the Actuaries Longevity Illustrator. Its implementation is proprietary and its published terms limit use to personal or educational, non-commercial purposes.
- Scraping SSA or NCHS during a user session.
- Adding medical history, income, geography, occupation, family history, or other longevity inputs in this version.
- Treating education as a biological cause of mortality. It remains a socioeconomic correlate in the fitted model.

## Source data

### SSA baseline

Use the [SSA 2023 Period Life Table](https://www.ssa.gov/oact/STATS/table4c6.html), published for the Social Security area population and used in the 2026 Trustees Report.

Store the full table from ages 0 through 119 as a versioned static artifact. Preserve the decimal one-year death probabilities exactly as published. Include:

- source URL;
- mortality year: 2023;
- Trustees Report year: 2026;
- retrieval date;
- supported age range; and
- a checksum or equivalent source-integrity value.

The application must not fetch or scrape this table at runtime. Annual updates are explicit, reviewed data changes.

This is a period-table design. It applies 2023 age-specific mortality rates to future years and does not project future mortality improvement. That limitation must appear in the methodology and user-facing source disclosure.

### Personalization model

Fit the personalization model from the official NHIS public-use Person and Sample Adult files joined to the [NCHS public-use NHIS Linked Mortality Files](https://www.cdc.gov/nchs/linked-data/mortality-files/index.html). The Person files supply education, self-rated health, demographics, survey design fields, and interview quarter; the Sample Adult files supply smoking status. The confirmed mortality release links NHIS interviews from 1986–2018 to mortality follow-up through the fourth quarter of 2019. Use:

- model-development cohort: NHIS interviews from 1997–2009, respondents age 60 or older;
- temporal-validation cohort: NHIS interviews from 2010–2013, respondents age 60 or older, providing at least five complete years of follow-up;
- final production-coefficient cohort, after the model specification passes temporal validation: NHIS interviews from 1997–2013;
- calibration target distribution: weighted NHIS respondents from 2015–2018, the latest interview years in the public-use release; and
- the survey weights, strata, and primary sampling units supplied with NHIS.

The 1997 start avoids mixing questionnaire definitions from the pre-1997 NHIS design. A newer restricted or future public release may replace this cohort only through a separately reviewed model version.

## Joint personalization model

Use a survey-weighted, person-quarter discrete-time survival model with a complementary log-log link. The public-use files disclose interview and death quarter, not exact dates or person-months. Represent each respondent age 60 or older with one row for every observed calendar quarter from interview through death or 2019 Q4. A death in the interview quarter contributes one event row; do not invent an interview day, death day, or fractional-day exposure.

Set attained age in each quarter to `ageAtInterview + floor(quartersSinceInterview / 4)`. The development model includes attained-age indicators and sex as nuisance terms so it can estimate adjusted relative effects. The runtime baseline comes from SSA, not from the fitted NHIS age terms.

The version-one profile predictors are main effects only:

- smoking: never, former, current;
- education: college degree or more, some college, high school or less;
- self-rated health: excellent or very good, good, fair or poor; and
- interview year, centered at 2014, as a nuisance term fixed at its reference value during runtime scoring.

Estimate all profile predictors in one model. Do not multiply independently sourced smoking, education, and health factors. Interactions are outside version one and require a new model version and the same validation gates.

Pool survey years according to NCHS multi-year guidance, including division of annual sample-adult weights by the number of pooled years. Handle missing model-development covariates with 20-dataset multiple imputation and combine coefficient estimates using Rubin's rules. Runtime personalization still requires all three answers; imputation is not used to guess a user's answers.

The model artifact must include coefficients, reference categories, exact year-specific NHIS variable mappings, inclusion and exclusion rules, risk-period construction, censoring date, pooled-weight construction, imputation settings, survey years, fit date, software version, validation results, and source links. The repository must also contain the reproducible extraction, harmonization, fitting, and validation scripts.

### Calibration to SSA

The fitted model estimates relative mortality among profiles. SSA supplies the absolute mortality level.

For each attained age and sex:

1. Predict each profile's relative hazard from the fitted joint model.
2. Use the weighted 2015–2018 NHIS respondents as the target profile distribution. Pool respondents into sex-specific attained-age bands of 60–69, 70–79, and 80+. Use the 80+ distribution for every modeled age from 80 through 119. Freeze and version the weighted profile combinations in each band with the model artifact.
3. Numerically solve for an age-and-sex-specific baseline hazard `lambda` such that:

   `weightedMean(1 - exp(-lambda × relativeHazard)) = ssaQx`

4. Calculate each profile's one-year death probability:

   `profileQx = 1 - exp(-lambda × relativeHazard)`

Solving on the probability scale is required because simply centering relative hazards to mean 1 does not exactly preserve the SSA death probability after the nonlinear hazard conversion.

## Longevity calculations

### Individual

Condition every curve on the person being alive on an explicit `asOfDate`. The application supplies today's local date; tests supply a fixed date. Treat each annual mortality hazard as constant from one birthday to the next. For partial birthday intervals, apply the hazard in proportion to the exact number of elapsed days in that interval, including leap days.

For a person with attained whole age `a`, cumulative survival to birthday age `t` includes the remaining fraction of the age-`a` interval, followed by complete age intervals `a + 1` through `t - 1`. Do not include the age-`a` interval twice.

For users younger than 60, apply unadjusted SSA mortality through their 60th birthday and personalized hazards from age 60 forward. Ages outside the SSA table's 0–119 range are unsupported.

For each probability, return the greatest whole birthday age whose cumulative survival remains at or above:

- 75%;
- 50%; and
- 25%.

Do not interpolate flag ages. This keeps the statement "chance of living to at least age X" mathematically true at the displayed whole age. A graph may interpolate a crossing for drawing, but cards and flags use the whole-age rule.

These are survival thresholds, not predicted death ages. UI copy must use "live to at least age," not "live until."

### Couple

For a timeline year `y`, evaluate both spouses at the same instant: December 31 of year `y`. Each displayed age is the person's age on that date, which is `y - birthYear`. Calculate partial-year survival to that shared date using the constant-within-age hazard rule above. Assuming independent survival conditional on the fitted profiles:

`eitherAlive(y) = 1 - (1 - person1Alive(y)) × (1 - person2Alive(y))`

For each probability, return the latest December 31 where `eitherAlive(y)` remains at or above the threshold. The timeline flag and tooltip use that calendar year.

Couple thresholds must be calculated by calendar year. A shared "one reaches age 92" calculation is not sufficient when spouses have different birth years because each spouse reaches 92 in a different year. Tooltip content shows the year and both spouses' ages in that year.

The conditional-independence assumption must appear in model documentation. Estimating within-couple mortality dependence is outside this version.

## Shared application architecture

Move mortality data and calculations out of `LifeExpectancyCalculator.jsx` into focused modules:

- a versioned SSA period-life-table artifact;
- a versioned NHIS model artifact;
- a pure individual mortality and survival engine;
- pure calendar-year household survival functions; and
- presentation adapters for the Life Expectancy module and Our Lifelong Timeline.

Bind each longevity profile to a stable household-person identifier. Do not persist generic `myHealth` and `spHealth` slots that can be applied to the wrong person when display order changes.

The Life Expectancy cards, graph, table, and timeline flags must consume the same engine outputs. No presentation component may reimplement mortality calculations.

## Behavior before personalization

Do not silently apply the current "never smoked, college+, good health" defaults.

When date of birth and sex are available but the three profile questions are incomplete:

- show headline life expectancy at birth;
- show unadjusted SSA 75%, 50%, and 25% survival flags;
- label them "SSA population estimate"; and
- offer a "Personalize these ages" link to the Life Expectancy module.

After all profile questions are answered, replace those probability flags with personalized results and identify the model version in the source disclosure.

## Timeline design

### Individual flags

Each person's timeline row shows:

- one muted, dashed "Headline" flag at the sex-specific SSA life expectancy at birth;
- a 75% survival flag;
- a visually emphasized 50% survival flag; and
- a 25% survival flag.

The longevity flags reuse the existing year-labeled milestone structure. Filing milestones remain unchanged. Since filing flags cluster from ages 62–70 and longevity flags usually occur later, both sets can share the row. Nearby longevity flags use the existing vertical stacking system and may alternate above and below the bar when needed.

If the headline age predates the visible timeline, pin the flag to the left edge and label it "Already passed." Keep the full headline tooltip.

The headline age is SSA's decimal life expectancy at age 0. Display it to one decimal place. Position the marker at the fractional calendar date obtained by adding that many years to the person's date of birth. Display the nearest calendar year using round-half-up; keep the one-decimal age in the flag and tooltip.

### Household flags

Married timelines add a slim "At least one alive" row containing the household 75%, 50%, and 25% calendar-year flags. Single-person timelines omit this row.

The flag label shows the probability and year. Its tooltip adds both spouses' ages and a short planning explanation.

### Timeline horizon

The timeline and its financial projections currently end at age 95. Extend them through the latest displayed longevity threshold. Round the visible end to the next five-year ruler interval unless the display cap binds.

An individual row stops at that person's 110th-birthday year. An individual threshold beyond that point is pinned to the person's 110th-birthday position and labeled `110+`.

The shared household display cap is the earlier of:

- the later-born spouse's 110th-birthday year; and
- the earlier-born spouse's 119th-birthday year, which is the last year supported by both SSA curves.

A household threshold beyond the cap is pinned to the right edge and labeled `Beyond {capYear}`. Its tooltip says the probability remains above the threshold through the last supported display year; it does not claim a calculated crossing year.

When the display cap binds, the axis ends exactly at `capYear` rather than rounding beyond it. The capped marker is positioned at `capYear`, which is therefore the right edge.

Capped individual tooltip:

> The chance {name} lives to at least age 110 remains above {probability}%. This timeline does not display later ages.

Capped household tooltip:

> The chance at least one of you is alive remains above {probability}% through {capYear}. {namesAndAges}. The shared timeline does not display later years.

Financial projections must exist through every displayed year so the cursor never shows false zero income after age 95.

## Tooltip interaction

Tooltips:

- open on hover and keyboard focus;
- remain open after click or tap;
- close on Escape or outside click;
- restore focus to the triggering flag;
- remain inside the visible scroll viewport;
- expose the same content to screen readers; and
- do not rely on color alone.

## Approved tooltip copy

### Headline flag

Use for each person's headline flag:

> Headline U.S. life expectancy starts at birth, so it includes infant deaths and deaths earlier in adulthood from accidents, overdoses, and homicide. These earlier deaths pull the average down. Life expectancy at 65 looks only at people who reached 65, so it is a better starting point for retirement planning.

### Individual probability flags

Use the person's name and calculated age:

> There is a 75% chance {name} will live to at least age {age75}.

> There is a 50% chance {name} will live to at least age {age50}.

> There is a 25% chance {name} will live to at least age {age25}.

### Household probability flags

The year and attained ages are calculated values. When both spouses have the same age, use the singular age form. Otherwise list both ages.

75%:

> There is a 75% chance at least one of you will be alive in {year}. {namesAndAges}. A couple's chance that one person lives a long time is higher than either person's chance alone.

50%:

> There is a 50% chance at least one of you will be alive in {year}. {namesAndAges}. This is why a couple's plan often needs to reach beyond either person's individual life expectancy.

25%:

> There is a 25% chance at least one of you will be alive in {year}. {namesAndAges}. The surviving spouse may need income years beyond either person's individual life expectancy.

Example equal-age sentence:

> Ted and Mary would both be 92.

Example unequal-age sentence:

> Ted would be 92, and Mary would be 88.

## Source disclosure

Before personalization:

> SSA 2023 period life table. Population estimate based on age and sex, using 2023 mortality rates without projected future improvement.

After personalization:

> SSA 2023 period life table, personalized with a U.S. NHIS Linked Mortality model, version {modelVersion}. Uses 2023 mortality rates without projected future improvement.

Both disclosures link to the source pages and the local model-methodology documentation.

## Error and boundary behavior

- Missing date of birth or sex: do not render the affected person's longevity flags. Show the existing profile-completion path.
- Sex not represented by the SSA table: explain that this SSA table publishes male and female baselines and cannot produce a supported estimate for the selected value. Do not infer or silently remap sex.
- Current age outside 0–119: do not calculate a longevity curve.
- Incomplete personalization answers: use the unadjusted SSA behavior defined above.
- Missing model coefficient or unsupported category: fail closed to the labeled SSA population estimate and record a diagnostic error. Do not substitute a healthy default.
- Missing SSA age: stop the curve at the last supported age and surface a development error. Remove the current `p *= 0.3` fallback.
- Individual threshold beyond the display cap: render `110+`.
- Household threshold beyond the display cap: render `Beyond {capYear}`.
- Married household with one invalid or missing spouse profile: render the valid person's individual flags, omit the household row, and show "Complete both profiles to estimate how long at least one of you may live."
- Same-year marker collision: preserve the true x-position and stack vertically. Do not move a marker to a false year.

## Validation

### Source and calculation tests

- Verify SSA values at ages 0, 65, 95, 110, and 119 against the official 2023 table.
- Verify age coverage, sex keys, decimal units, and source metadata.
- Verify hazard conversion and inverse conversion.
- Verify monotonic cumulative survival and whole-age selection at 75%, 50%, and 25%.
- Verify that the weighted mean of calibrated profile death probabilities equals SSA `qx` to an absolute tolerance of `1e-10` for every modeled age and sex.
- Verify identical profile inputs produce identical thresholds in the Life Expectancy module and timeline.

### Model validation

The 2010–2013 temporal cohort validates mortality at 4, 12, and 20 observed quarters, corresponding to one, three, and five years at the precision available in the public-use data. It does not validate lifetime 25%, 50%, or 75% thresholds. Those lifetime thresholds inherit the period-table assumption and exact SSA calibration. Lock the model specification after development and before temporal validation. If it passes, refit the same specification on the 1997–2013 production-coefficient cohort without further variable or interaction selection.

Temporal validation evaluates the untouched NHIS development-model probabilities, including its fitted baseline and interview-year term, against 2010–2013 observed outcomes. It does not compare historical outcomes directly with the later SSA 2023 period baseline. Production-scale correctness is tested separately by proving that the weighted personalized probabilities reproduce every SSA 2023 `qx` value to the stated numeric tolerance.

Report weighted 4-, 12-, and 20-quarter Brier scores, calibration-in-the-large, calibration slope, and observed versus predicted mortality. Release requires:

- absolute observed-minus-predicted mortality no greater than 2 percentage points overall at each horizon;
- absolute observed-minus-predicted mortality no greater than 3 percentage points for each sex, attained-age band (60–69, 70–79, 80+), smoking group, education group, and health group with at least 100 observed deaths;
- calibration slope from 0.80 through 1.20 at each horizon;
- temporal validation on the 2010–2013 interview cohort; and
- coefficient estimates and 95% confidence intervals reported across imputed datasets.

Groups with fewer than 100 observed deaths are reported but do not independently gate release. A failed gate requires revising or rejecting the model; discrimination alone cannot override failed calibration.

### Couple and timeline tests

- Equal and unequal birth years.
- Correct 75%, 50%, and 25% calendar-year household thresholds.
- Correct attained ages for both spouses in household tooltips.
- Single-person timeline without a household row.
- Headline age before the visible axis.
- Threshold and financial projection beyond age 95.
- Individual `110+` and household `Beyond {capYear}` behavior.
- Nearby and same-year marker collisions.
- Mouse, keyboard, touch, Escape, focus restoration, and screen-reader tooltip behavior.

## Acceptance criteria

- SSA 2023 is the only absolute mortality baseline.
- Smoking, education, and health are estimated together in one documented model.
- No undocumented mortality multiplier remains in production code.
- No runtime source scraping is introduced.
- The Life Expectancy module and timeline agree for every shared fixture.
- Individual flags show headline, 75%, 50%, and 25% values for the correct person.
- Married timelines show calendar-aligned 75%, 50%, and 25% "At least one alive" flags.
- Approved tooltip copy is used with calculated names, ages, and years.
- No production marker contains an illustrative or hardcoded longevity age.
- Every displayed timeline year has corresponding financial projection data.

## References

- [SSA 2023 Period Life Table](https://www.ssa.gov/oact/STATS/table4c6.html)
- [SSA Life Expectancy Calculator](https://www.ssa.gov/OACT/population/longevity.html)
- [NCHS Linked Mortality Files](https://www.cdc.gov/nchs/linked-data/mortality-files/index.html)
- [Actuaries Longevity Illustrator FAQ](https://www.longevityillustrator.org/us-longevity-illustrator-faq/)
- [Smoking and all-cause mortality in older adults](https://pubmed.ncbi.nlm.nih.gov/26188685/)
- [Self-rated health mortality meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC1828094/)
- [Education and U.S. adult mortality](https://pmc.ncbi.nlm.nih.gov/articles/PMC4435622/)
