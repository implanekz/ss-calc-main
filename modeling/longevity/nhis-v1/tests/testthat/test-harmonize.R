library(testthat)

source(test_path("..", "..", "R", "load_inputs.R"))
source(test_path("..", "..", "R", "harmonize.R"))

synthetic_mapping <- function() {
  list(
    person = list(
      fields = list(
        person_id = list(source = c("SRVY_YR", "HHX", "FMX", "FPX")),
        interview_quarter = list(source = "INTV_QRT"),
        age_at_interview = list(source = "AGE_P"),
        sex = list(
          source = "SEX",
          codes = list(male = "1", female = "2"),
          missing_codes = c("7", "8", "9")
        ),
        education = list(
          source = "EDUC1",
          codes = list(college = "C", some = "S", high_school = "H"),
          missing_codes = "M"
        ),
        self_rated_health = list(
          source = "PHSTAT",
          codes = list(excellent = "E", good = "G", fair = "F"),
          missing_codes = "M"
        ),
        stratum = list(source = "PSTRAT"),
        psu = list(source = "PPSU")
      )
    ),
    sample_adult = list(
      fields = list(
        person_id = list(source = c("SRVY_YR", "HHX", "FMX", "FPX")),
        smoking = list(
          source = "SMKSTAT2",
          codes = list(never = "4", former = "3", current = c("1", "2")),
          missing_codes = c("7", "8", "9")
        ),
        sample_weight = list(source = "WTFA_SA")
      )
    )
  )
}

synthetic_person_rows <- function() {
  data.frame(
    SRVY_YR = rep("2018", 4),
    HHX = rep("000001", 4),
    FMX = rep("01", 4),
    FPX = sprintf("%02d", 1:4),
    INTV_QRT = c("1", "2", "3", "4"),
    AGE_P = c("60", "70", "80", "65"),
    SEX = c("1", "2", "9", "1"),
    EDUC1 = c("C", "S", "H", "M"),
    PHSTAT = c("E", "G", "F", "M"),
    PSTRAT = c("101", "101", "102", "102"),
    PPSU = c("1", "2", "1", "2"),
    stringsAsFactors = FALSE
  )
}

synthetic_sample_adult_rows <- function() {
  data.frame(
    SRVY_YR = rep("2018", 4),
    HHX = rep("000001", 4),
    FMX = rep("01", 4),
    FPX = sprintf("%02d", 1:4),
    SMKSTAT2 = c("4", "3", "1", "2"),
    WTFA_SA = c("1300", "2600", "3900", "5200"),
    stringsAsFactors = FALSE
  )
}

synthetic_lmf_mapping <- function() {
  list(
    fields = list(
      person_id = list(source = "PUBLICID"),
      mortality_eligibility = list(
        source = "ELIGSTAT",
        codes = list(eligible = "1", ineligible = "3"),
        missing_codes = "2"
      ),
      mortality_status = list(
        source = "MORTSTAT",
        codes = list(alive = "0", deceased = "1"),
        missing_codes = ""
      ),
      death_year = list(source = "DODYEAR"),
      death_quarter = list(source = "DODQTR")
    )
  )
}

test_that("configured source codes map to runtime categories or explicit missing", {
  harmonized <- harmonize_nhis(
    synthetic_person_rows(),
    synthetic_sample_adult_rows(),
    synthetic_mapping(),
    year = 2018,
    pool_year_count = 13
  )

  expect_setequal(na.omit(harmonized$smoking), c("never", "former", "current"))
  expect_setequal(na.omit(harmonized$education), c("college", "some", "high_school"))
  expect_setequal(na.omit(harmonized$self_rated_health), c("excellent", "good", "fair"))
  expect_setequal(na.omit(harmonized$sex), c("male", "female"))
})

test_that("unmapped observed source codes are rejected", {
  adult <- synthetic_sample_adult_rows()
  adult$SMKSTAT2[1] <- "UNDOCUMENTED"

  expect_error(
    harmonize_nhis(
      synthetic_person_rows(),
      adult,
      synthetic_mapping(),
      year = 2018,
      pool_year_count = 13
    ),
    "unmapped source code.*smoking"
  )
})

test_that("pooled weights divide annual weights by cohort year count", {
  rows <- data.frame(sample_weight = c(1300, 2600), pool_year_count = c(13, 13))
  expect_equal(pool_weights(rows), c(100, 200))
})

test_that("every sample adult joins to exactly one Person record", {
  harmonized <- harmonize_nhis(
    synthetic_person_rows(),
    synthetic_sample_adult_rows()[c(2, 4), ],
    synthetic_mapping(),
    year = 2018,
    pool_year_count = 13
  )

  expect_equal(harmonized$person_id, c("20180000010102", "20180000010104"))
  expect_equal(harmonized$age_at_interview, c(70, 65))
})

test_that("duplicate or unmatched one-to-one join keys are rejected", {
  duplicate_person <- rbind(synthetic_person_rows(), synthetic_person_rows()[1, ])
  expect_error(
    harmonize_nhis(
      duplicate_person,
      synthetic_sample_adult_rows(),
      synthetic_mapping(),
      year = 2018,
      pool_year_count = 13
    ),
    "Person identifiers must be unique"
  )

  unmatched_adult <- synthetic_sample_adult_rows()
  unmatched_adult$FPX[1] <- "99"
  expect_error(
    harmonize_nhis(
      synthetic_person_rows(),
      unmatched_adult,
      synthetic_mapping(),
      year = 2018,
      pool_year_count = 13
    ),
    "does not match exactly one Person record"
  )
})

test_that("incomplete component mappings are rejected before input is read", {
  mapping <- synthetic_mapping()
  mapping$person$fields$interview_quarter$source <- NULL

  expect_error(validate_year_mapping(mapping, 2004), "missing required mappings.*interview_quarter")
})

test_that("linked mortality retains documented death year and quarter", {
  rows <- data.frame(
    PUBLICID = c("20180000010101", "20180000010102"),
    ELIGSTAT = c("1", "1"),
    MORTSTAT = c("1", "0"),
    DODYEAR = c("2019", ""),
    DODQTR = c("2", ""),
    stringsAsFactors = FALSE
  )

  harmonized <- harmonize_lmf(rows, synthetic_lmf_mapping())

  expect_equal(harmonized$mortality_status, c(1L, 0L))
  expect_equal(harmonized$death_year, c(2019L, NA_integer_))
  expect_equal(harmonized$death_quarter, c(2L, NA_integer_))
})

test_that("ineligible linked-mortality records retain missing outcomes", {
  rows <- data.frame(
    PUBLICID = "20180000010103",
    ELIGSTAT = "3",
    MORTSTAT = "",
    DODYEAR = "",
    DODQTR = "",
    stringsAsFactors = FALSE
  )

  harmonized <- harmonize_lmf(rows, synthetic_lmf_mapping())

  expect_equal(harmonized$mortality_eligibility, "ineligible")
  expect_true(is.na(harmonized$mortality_status))
  expect_true(is.na(harmonized$death_year))
  expect_true(is.na(harmonized$death_quarter))
})

test_that("official SAS layouts parse multiple fields per line and legacy punctuation", {
  sas_path <- tempfile(fileext = ".sas")
  bytes <- c(
    charToRaw("/* legacy punctuation: "),
    as.raw(0x92),
    charToRaw(" */\nINPUT\n  SRVY_YR 3 - 6  HHX $ 7 - 12  FMX $ 13 - 14\n;\n")
  )
  writeBin(bytes, sas_path)

  expect_no_warning(layout <- parse_sas_fixed_width_layout(sas_path))
  expect_equal(layout$source, c("SRVY_YR", "HHX", "FMX"))
  expect_equal(layout$start, c(3L, 7L, 13L))
  expect_equal(layout$end, c(6L, 12L, 14L))
})

test_that("production Person maps supply education and health for every interview year", {
  skip_if_not_installed("yaml")
  variable_map <- read_variable_map(test_path("..", "..", "config", "variable-map.yml"))

  for (year in as.character(1997:2018)) {
    fields <- variable_map$nhis[[year]]$person$fields
    expect_true(
      mapping_has_source(fields$education),
      info = sprintf("%s education", year)
    )
    expect_true(
      mapping_has_source(fields$self_rated_health),
      info = sprintf("%s self_rated_health", year)
    )
    expect_true(
      !is.null(fields$education$codes) && length(fields$education$codes) > 0L,
      info = sprintf("%s education codes", year)
    )
    expect_true(
      !is.null(fields$self_rated_health$codes) && length(fields$self_rated_health$codes) > 0L,
      info = sprintf("%s health codes", year)
    )
  }
})

test_that("the loader accepts complete annual maps and rejects 2004's missing quarter", {
  skip_if_not_installed("yaml")
  variable_map <- read_variable_map(test_path("..", "..", "config", "variable-map.yml"))

  for (year in setdiff(1997:2018, 2004)) {
    expect_silent(get_year_mapping(variable_map, year))
  }
  expect_error(get_year_mapping(variable_map, 2004), "interview_quarter")
})

test_that("incomplete linked-mortality mappings are rejected", {
  mapping <- synthetic_lmf_mapping()
  mapping$fields$death_quarter$source <- NULL

  expect_error(validate_lmf_mapping(mapping), "death_quarter")
})

test_that("imputation is restricted to model-development records", {
  source(test_path("..", "..", "R", "impute.R"))
  records <- data.frame(
    cohort_role = "calibration",
    mortality_status = 0L,
    age_at_interview = 70,
    sex = "female",
    survey_year = 2015L,
    pooled_weight = 100,
    smoking = "never",
    education = "college",
    self_rated_health = "good",
    stringsAsFactors = FALSE
  )

  expect_error(
    impute_model_development(records),
    "restricted to model-development records"
  )
})

test_that("development and production_fit year lists do not include 2004", {
  skip_if_not_installed("yaml")
  cohorts <- yaml::read_yaml(test_path("..", "..", "config", "cohorts.yml"))

  expect_false(2004 %in% cohorts$development$interview_years)
  expect_false(2004 %in% cohorts$production_fit$interview_years)
})

test_that("cohort assembly keeps age 60 and drops younger respondents", {
  rows <- data.frame(
    person_id = c("under-age", "floor-age"),
    age_at_interview = c(59, 60),
    stringsAsFactors = FALSE
  )
  cohort <- list(minimum_age = 60)

  kept <- select_cohort_respondents(rows, cohort)

  expect_equal(kept$person_id, "floor-age")
  expect_equal(kept$age_at_interview, 60)
})
