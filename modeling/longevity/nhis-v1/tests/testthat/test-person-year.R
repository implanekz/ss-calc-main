library(testthat)

source(test_path("..", "..", "R", "person_year.R"))

respondent <- function(age, followup_years, mortality_status = 0L) {
  data.frame(
    person_id = "synthetic-1",
    survey_year = 2000L,
    age_at_interview = age,
    followup_days = followup_years * 365.2425,
    mortality_status = mortality_status,
    stringsAsFactors = FALSE
  )
}

test_that("entry before age 60 contributes exposure only after age 60", {
  expanded <- expand_person_years(respondent(59, 2))

  expect_equal(expanded$attained_age, 60L)
  expect_equal(expanded$exposure, 1, tolerance = 1e-12)
  expect_equal(expanded$event, 0L)
})

test_that("censoring produces no event", {
  expanded <- expand_person_years(respondent(60.25, 1.5, 0L))

  expect_equal(expanded$attained_age, c(60L, 61L))
  expect_equal(expanded$exposure, c(0.75, 0.75), tolerance = 1e-12)
  expect_equal(expanded$event, c(0L, 0L))
})

test_that("death is assigned to the final exposed interval", {
  expanded <- expand_person_years(respondent(60.25, 1.5, 1L))

  expect_equal(expanded$event, c(0L, 1L))
})

test_that("death on an exact birthday remains in the preceding interval", {
  expanded <- expand_person_years(respondent(60, 1, 1L))

  expect_equal(expanded$attained_age, 60L)
  expect_equal(expanded$exposure, 1, tolerance = 1e-12)
  expect_equal(expanded$event, 1L)
})

test_that("zero follow-up produces no person-year records", {
  expanded <- expand_person_years(respondent(65, 0))

  expect_equal(nrow(expanded), 0L)
})

test_that("multiple respondents retain survey design and profile fields", {
  rows <- rbind(
    transform(
      respondent(60.5, 1),
      sex = "female", smoking = "never", education = "college",
      self_rated_health = "good", pooled_weight = 100,
      stratum = 10, psu = 1
    ),
    transform(
      respondent(70, 0.5),
      person_id = "synthetic-2", sex = "male", smoking = "former",
      education = "high_school", self_rated_health = "fair",
      pooled_weight = 200, stratum = 11, psu = 2
    )
  )

  expanded <- expand_person_year_dataset(rows)

  expect_setequal(expanded$person_id, c("synthetic-1", "synthetic-2"))
  expect_true(all(c(
    "survey_year", "sex", "smoking", "education", "self_rated_health",
    "pooled_weight", "stratum", "psu"
  ) %in% names(expanded)))
})
