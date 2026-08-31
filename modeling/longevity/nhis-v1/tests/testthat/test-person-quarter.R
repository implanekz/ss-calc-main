library(testthat)

source(test_path("..", "..", "R", "person_quarter.R"))

respondent <- function(
    survey_year = 2018L,
    interview_quarter = 1L,
    mortality_status = 0L,
    death_year = NA_integer_,
    death_quarter = NA_integer_) {
  data.frame(
    person_id = "synthetic-1",
    survey_year = survey_year,
    interview_quarter = interview_quarter,
    age_at_interview = 60L,
    mortality_status = mortality_status,
    death_year = death_year,
    death_quarter = death_quarter,
    stringsAsFactors = FALSE
  )
}

test_that("alive respondents are observed through 2019 Q4", {
  expanded <- expand_person_quarters(respondent(2018L, 3L, 0L))

  expect_equal(expanded$quarter_index, quarter_index(2018L, 3L):quarter_index(2019L, 4L))
  expect_equal(expanded$quarters_since_interview, 0:5)
  expect_true(all(expanded$event == 0L))
})

test_that("death in a later quarter is the final event quarter", {
  expanded <- expand_person_quarters(respondent(2017L, 4L, 1L, 2018L, 2L))

  expect_equal(expanded$quarter_index, quarter_index(2017L, 4L):quarter_index(2018L, 2L))
  expect_equal(expanded$event, c(0L, 0L, 1L))
})

test_that("death in the interview quarter produces one event row", {
  expanded <- expand_person_quarters(respondent(2018L, 2L, 1L, 2018L, 2L))

  expect_equal(nrow(expanded), 1L)
  expect_equal(expanded$event, 1L)
  expect_equal(expanded$quarters_since_interview, 0L)
  expect_equal(expanded$quarter_index, quarter_index(2018L, 2L))
})

test_that("death before interview is rejected", {
  expect_error(
    expand_person_quarters(respondent(2018L, 2L, 1L, 2018L, 1L)),
    "death quarter precedes interview quarter"
  )
})

test_that("attained age advances only after four observed quarters", {
  expanded <- expand_person_quarters(respondent(2018L, 1L, 1L, 2019L, 1L))

  expect_equal(expanded$quarters_since_interview, 0:4)
  expect_equal(expanded$attained_age, c(60L, 60L, 60L, 60L, 61L))
})

test_that("dataset expansion retains survey design and profile fields", {
  rows <- rbind(
    transform(
      respondent(2018L, 1L, 1L, 2018L, 2L),
      sex = "female", smoking = "never", education = "college",
      self_rated_health = "good", pooled_weight = 100,
      stratum = 10, psu = 1
    ),
    transform(
      respondent(2017L, 4L, 1L, 2018L, 1L),
      person_id = "synthetic-2", sex = "male", smoking = "former",
      education = "high_school", self_rated_health = "fair",
      pooled_weight = 200, stratum = 11, psu = 2
    )
  )

  expanded <- expand_person_quarter_dataset(rows)

  expect_setequal(expanded$person_id, c("synthetic-1", "synthetic-2"))
  expect_true(all(c(
    "survey_year", "interview_quarter", "sex", "smoking", "education",
    "self_rated_health", "pooled_weight", "stratum", "psu"
  ) %in% names(expanded)))
  first <- expanded[expanded$person_id == "synthetic-1", ]
  expect_true(all(first$sex == "female"))
  expect_true(all(first$pooled_weight == 100))
  expect_true(all(first$stratum == 10))
  expect_true(all(first$psu == 1))
})
