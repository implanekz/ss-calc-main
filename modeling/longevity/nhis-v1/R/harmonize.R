source_column <- function(rows, field, canonical_name) {
  source <- field$source
  if (is.null(source) || length(source) != 1L || !nzchar(source)) {
    stop(sprintf("Missing source column mapping for %s.", canonical_name), call. = FALSE)
  }
  if (!source %in% names(rows)) {
    stop(sprintf("Input does not contain mapped source column %s for %s.", source, canonical_name), call. = FALSE)
  }
  rows[[source]]
}

recode_mapped_field <- function(values, field, canonical_name) {
  codes <- field$codes
  if (is.null(codes) || length(codes) == 0L) {
    stop(sprintf("No explicit category mapping for %s.", canonical_name), call. = FALSE)
  }

  category_codes <- lapply(codes, function(item) as.character(unlist(item, use.names = FALSE)))
  all_category_codes <- unlist(category_codes, use.names = FALSE)
  duplicates <- unique(all_category_codes[duplicated(all_category_codes)])
  if (length(duplicates) > 0L) {
    stop(
      sprintf("Source codes map to multiple %s categories: %s", canonical_name, paste(duplicates, collapse = ", ")),
      call. = FALSE
    )
  }

  missing_codes <- as.character(unlist(field$missing_codes, use.names = FALSE))
  normalized <- trimws(as.character(values))
  observed <- unique(normalized[!is.na(normalized)])
  unknown <- setdiff(observed, c(all_category_codes, missing_codes))
  if (length(unknown) > 0L) {
    stop(
      sprintf(
        "Observed unmapped source code(s) for %s: %s",
        canonical_name,
        paste(unknown, collapse = ", ")
      ),
      call. = FALSE
    )
  }

  result <- rep(NA_character_, length(normalized))
  for (category in names(category_codes)) {
    result[normalized %in% category_codes[[category]]] <- category
  }
  result
}

compose_person_id <- function(rows, field) {
  sources <- as.character(field$source)
  if (length(sources) == 0L || any(!sources %in% names(rows))) {
    missing <- setdiff(sources, names(rows))
    stop(
      sprintf("Input is missing person-id source columns: %s", paste(missing, collapse = ", ")),
      call. = FALSE
    )
  }
  parts <- lapply(sources, function(name) trimws(as.character(rows[[name]])))
  do.call(paste0, parts)
}

join_person_sample_adult <- function(person_rows, sample_adult_rows, mapping) {
  person_ids <- compose_person_id(person_rows, mapping$person$fields$person_id)
  adult_ids <- compose_person_id(sample_adult_rows, mapping$sample_adult$fields$person_id)

  if (anyDuplicated(person_ids)) {
    stop("Person identifiers must be unique before the Person/Sample Adult join.", call. = FALSE)
  }
  if (anyDuplicated(adult_ids)) {
    stop("Sample Adult identifiers must be unique before the Person/Sample Adult join.", call. = FALSE)
  }

  person_index <- match(adult_ids, person_ids)
  if (anyNA(person_index)) {
    stop("A Sample Adult identifier does not match exactly one Person record.", call. = FALSE)
  }

  list(
    person_id = adult_ids,
    person = person_rows[person_index, , drop = FALSE],
    sample_adult = sample_adult_rows
  )
}

pool_weights <- function(rows) {
  weights <- as.numeric(rows$sample_weight)
  year_counts <- as.numeric(rows$pool_year_count)
  if (
    length(weights) != length(year_counts) ||
    any(!is.finite(weights)) ||
    any(!is.finite(year_counts)) ||
    any(year_counts <= 0)
  ) {
    stop("sample_weight and pool_year_count must be finite, aligned, and positive.", call. = FALSE)
  }
  weights / year_counts
}

harmonize_nhis <- function(
    person_rows,
    sample_adult_rows,
    mapping,
    year,
    pool_year_count) {
  if (exists("validate_year_mapping", mode = "function")) {
    validate_year_mapping(mapping, year)
  }
  joined <- join_person_sample_adult(person_rows, sample_adult_rows, mapping)
  person_fields <- mapping$person$fields
  adult_fields <- mapping$sample_adult$fields

  interview_quarter <- as.integer(source_column(
    joined$person,
    person_fields$interview_quarter,
    "interview_quarter"
  ))
  if (anyNA(interview_quarter) || any(!interview_quarter %in% 1:4)) {
    stop("Interview quarter must be explicitly coded 1 through 4.", call. = FALSE)
  }

  output <- data.frame(
    person_id = joined$person_id,
    survey_year = as.integer(year),
    interview_quarter = interview_quarter,
    age_at_interview = as.numeric(source_column(
      joined$person,
      person_fields$age_at_interview,
      "age_at_interview"
    )),
    sex = recode_mapped_field(
      source_column(joined$person, person_fields$sex, "sex"),
      person_fields$sex,
      "sex"
    ),
    smoking = recode_mapped_field(
      source_column(joined$sample_adult, adult_fields$smoking, "smoking"),
      adult_fields$smoking,
      "smoking"
    ),
    education = recode_mapped_field(
      source_column(joined$person, person_fields$education, "education"),
      person_fields$education,
      "education"
    ),
    self_rated_health = recode_mapped_field(
      source_column(
        joined$person,
        person_fields$self_rated_health,
        "self_rated_health"
      ),
      person_fields$self_rated_health,
      "self_rated_health"
    ),
    sample_weight = as.numeric(source_column(
      joined$sample_adult,
      adult_fields$sample_weight,
      "sample_weight"
    )),
    stratum = source_column(joined$person, person_fields$stratum, "stratum"),
    psu = source_column(joined$person, person_fields$psu, "psu"),
    pool_year_count = as.integer(pool_year_count),
    stringsAsFactors = FALSE,
    check.names = FALSE
  )
  output$pooled_weight <- pool_weights(output)
  output
}

harmonize_lmf <- function(rows, mapping) {
  if (exists("validate_lmf_mapping", mode = "function")) {
    validate_lmf_mapping(mapping)
  }
  fields <- mapping$fields
  eligibility <- recode_mapped_field(
    source_column(rows, fields$mortality_eligibility, "mortality_eligibility"),
    fields$mortality_eligibility,
    "mortality_eligibility"
  )
  mortality <- recode_mapped_field(
    source_column(rows, fields$mortality_status, "mortality_status"),
    fields$mortality_status,
    "mortality_status"
  )
  death_year <- suppressWarnings(as.integer(
    source_column(rows, fields$death_year, "death_year")
  ))
  death_quarter <- suppressWarnings(as.integer(
    source_column(rows, fields$death_quarter, "death_quarter")
  ))
  deceased <- !is.na(mortality) & mortality == "deceased"
  if (
    any(deceased & is.na(death_year)) ||
    any(deceased & (is.na(death_quarter) | !death_quarter %in% 1:4))
  ) {
    stop("Deceased records require documented death year and quarter.", call. = FALSE)
  }
  death_year[!deceased | is.na(deceased)] <- NA_integer_
  death_quarter[!deceased | is.na(deceased)] <- NA_integer_

  data.frame(
    person_id = as.character(source_column(rows, fields$person_id, "person_id")),
    mortality_eligibility = eligibility,
    mortality_status = ifelse(
      is.na(mortality),
      NA_integer_,
      ifelse(mortality == "deceased", 1L, 0L)
    ),
    death_year = death_year,
    death_quarter = death_quarter,
    stringsAsFactors = FALSE
  )
}

join_nhis_mortality <- function(nhis, mortality) {
  if (anyDuplicated(nhis$person_id)) {
    stop("NHIS person_id values must be unique within an annual Sample Adult file.", call. = FALSE)
  }
  if (anyDuplicated(mortality$person_id)) {
    stop("Linked mortality person_id values must be unique within an annual file.", call. = FALSE)
  }
  match_index <- match(nhis$person_id, mortality$person_id)
  if (anyNA(match_index)) {
    stop("Every NHIS respondent must have a corresponding linked-mortality record.", call. = FALSE)
  }
  cbind(
    nhis,
    mortality[
      match_index,
      c("mortality_eligibility", "mortality_status", "death_year", "death_quarter"),
      drop = FALSE
    ]
  )
}

select_cohort_respondents <- function(rows, cohort) {
  if (!is.data.frame(rows) || !"age_at_interview" %in% names(rows)) {
    stop("rows must include age_at_interview.", call. = FALSE)
  }
  minimum_age <- suppressWarnings(as.numeric(cohort$minimum_age))
  if (length(minimum_age) != 1L || is.na(minimum_age)) {
    stop("Cohort is missing a finite minimum_age.", call. = FALSE)
  }
  ages <- as.numeric(rows$age_at_interview)
  rows[!is.na(ages) & ages >= minimum_age, , drop = FALSE]
}
