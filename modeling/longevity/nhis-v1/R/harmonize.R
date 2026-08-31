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

harmonize_health <- function(rows, mapping) {
  fields <- mapping$fields
  canonical <- c("sex", "smoking", "education", "self_rated_health")
  output <- lapply(canonical, function(name) {
    field <- fields[[name]]
    values <- source_column(rows, field, name)
    recode_mapped_field(values, field, name)
  })
  names(output) <- canonical
  as.data.frame(output, stringsAsFactors = FALSE)
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

harmonize_nhis <- function(rows, mapping, year, pool_year_count) {
  if (exists("validate_year_mapping", mode = "function")) {
    validate_year_mapping(mapping, year)
  }
  fields <- mapping$fields
  health <- harmonize_health(rows, mapping)
  output <- data.frame(
    person_id = compose_person_id(rows, fields$person_id),
    survey_year = as.integer(year),
    age_at_interview = as.numeric(source_column(rows, fields$age_at_interview, "age_at_interview")),
    health,
    sample_weight = as.numeric(source_column(rows, fields$sample_weight, "sample_weight")),
    stratum = source_column(rows, fields$stratum, "stratum"),
    psu = source_column(rows, fields$psu, "psu"),
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
  data.frame(
    person_id = as.character(source_column(rows, fields$person_id, "person_id")),
    mortality_eligibility = eligibility,
    mortality_status = ifelse(
      is.na(mortality),
      NA_integer_,
      ifelse(mortality == "deceased", 1L, 0L)
    ),
    followup_days = as.numeric(source_column(rows, fields$followup_days, "followup_days")),
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
    mortality[match_index, c("mortality_eligibility", "mortality_status", "followup_days"), drop = FALSE]
  )
}
