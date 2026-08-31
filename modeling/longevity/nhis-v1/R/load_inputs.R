required_nhis_fields <- function() {
  c(
    "person_id", "age_at_interview", "sex", "smoking", "education",
    "self_rated_health", "sample_weight", "stratum", "psu"
  )
}

mapping_has_source <- function(field) {
  !is.null(field) &&
    !is.null(field$source) &&
    length(field$source) > 0L &&
    all(!is.na(field$source)) &&
    all(nzchar(as.character(field$source)))
}

validate_year_mapping <- function(mapping, year) {
  fields <- mapping$fields
  required <- required_nhis_fields()
  missing <- required[
    !vapply(required, function(name) mapping_has_source(fields[[name]]), logical(1))
  ]

  if (length(missing) > 0L) {
    stop(
      sprintf(
        "NHIS %s missing required mappings: %s",
        year,
        paste(missing, collapse = ", ")
      ),
      call. = FALSE
    )
  }

  categorical <- c("sex", "smoking", "education", "self_rated_health")
  missing_codes <- categorical[
    !vapply(categorical, function(name) {
      codes <- fields[[name]]$codes
      !is.null(codes) && length(codes) > 0L
    }, logical(1))
  ]
  if (length(missing_codes) > 0L) {
    stop(
      sprintf(
        "NHIS %s missing explicit category mappings: %s",
        year,
        paste(missing_codes, collapse = ", ")
      ),
      call. = FALSE
    )
  }

  invisible(mapping)
}

validate_lmf_mapping <- function(mapping) {
  required <- c("person_id", "mortality_eligibility", "mortality_status", "followup_days")
  missing <- required[
    !vapply(required, function(name) mapping_has_source(mapping$fields[[name]]), logical(1))
  ]
  if (length(missing) > 0L) {
    stop(
      sprintf("2019 public-use NHIS LMF missing required mappings: %s", paste(missing, collapse = ", ")),
      call. = FALSE
    )
  }
  invisible(mapping)
}

read_variable_map <- function(path = "config/variable-map.yml") {
  if (!requireNamespace("yaml", quietly = TRUE)) {
    stop("Package 'yaml' is required to read variable-map.yml.", call. = FALSE)
  }
  yaml::read_yaml(path)
}

get_year_mapping <- function(variable_map, year) {
  mapping <- variable_map$nhis[[as.character(year)]]
  if (is.null(mapping)) {
    stop(sprintf("No NHIS mapping configured for %s.", year), call. = FALSE)
  }
  validate_year_mapping(mapping, year)
  mapping
}

parse_sas_fixed_width_layout <- function(path) {
  lines <- readLines(path, warn = FALSE, encoding = "latin1")
  pattern <- "([A-Za-z][A-Za-z0-9_]*)\\s+(?:\\$\\s*)?([0-9]+)\\s*-\\s*([0-9]+)"
  captures <- unlist(
    lapply(lines, function(line) {
      matches <- gregexec(pattern, line, perl = TRUE)
      line_captures <- regmatches(line, matches)[[1]]
      if (is.null(dim(line_captures))) {
        return(list())
      }
      lapply(seq_len(ncol(line_captures)), function(index) line_captures[, index])
    }),
    recursive = FALSE
  )

  if (length(captures) == 0L) {
    stop(sprintf("No fixed-width INPUT columns found in %s.", path), call. = FALSE)
  }

  layout <- do.call(
    rbind,
    lapply(captures, function(item) {
      data.frame(
        source = toupper(item[[2]]),
        start = as.integer(item[[3]]),
        end = as.integer(item[[4]]),
        stringsAsFactors = FALSE
      )
    })
  )
  layout <- layout[!duplicated(layout$source), , drop = FALSE]
  rownames(layout) <- NULL
  layout
}

resolve_ascii_input <- function(path) {
  if (!grepl("\\.zip$", path, ignore.case = TRUE)) {
    return(path)
  }

  members <- utils::unzip(path, list = TRUE)$Name
  candidates <- members[grepl("\\.(dat|txt|asc)$", members, ignore.case = TRUE)]
  if (length(candidates) != 1L) {
    stop(
      sprintf("Expected exactly one ASCII data member in %s; found %s.", path, length(candidates)),
      call. = FALSE
    )
  }
  extraction_dir <- tempfile("nhis-unzip-")
  dir.create(extraction_dir)
  utils::unzip(path, files = candidates, exdir = extraction_dir)
  file.path(extraction_dir, candidates)
}

read_fixed_width_columns <- function(path, layout, source_names) {
  source_names <- unique(toupper(as.character(source_names)))
  missing <- setdiff(source_names, layout$source)
  if (length(missing) > 0L) {
    stop(
      sprintf("Official layout does not contain required source columns: %s", paste(missing, collapse = ", ")),
      call. = FALSE
    )
  }

  input_path <- resolve_ascii_input(path)
  lines <- readLines(input_path, warn = FALSE)
  selected <- layout[match(source_names, layout$source), , drop = FALSE]
  columns <- lapply(seq_len(nrow(selected)), function(index) {
    trimws(substr(lines, selected$start[[index]], selected$end[[index]]))
  })
  names(columns) <- selected$source
  as.data.frame(columns, stringsAsFactors = FALSE, check.names = FALSE)
}

mapped_source_names <- function(mapping) {
  unique(unlist(lapply(mapping$fields, function(field) field$source), use.names = FALSE))
}

read_nhis_input <- function(path, sas_layout_path, mapping, year) {
  validate_year_mapping(mapping, year)

  if (grepl("\\.(zip|dat|txt|asc)$", path, ignore.case = TRUE)) {
    layout <- parse_sas_fixed_width_layout(sas_layout_path)
    return(read_fixed_width_columns(path, layout, mapped_source_names(mapping)))
  }
  if (grepl("\\.csv$", path, ignore.case = TRUE)) {
    return(utils::read.csv(path, colClasses = "character", check.names = FALSE))
  }
  if (grepl("\\.rds$", path, ignore.case = TRUE)) {
    return(readRDS(path))
  }
  if (grepl("\\.(xpt|dta)$", path, ignore.case = TRUE)) {
    if (!requireNamespace("haven", quietly = TRUE)) {
      stop("Package 'haven' is required for XPT or DTA inputs.", call. = FALSE)
    }
    if (grepl("\\.xpt$", path, ignore.case = TRUE)) {
      return(as.data.frame(haven::read_xpt(path), stringsAsFactors = FALSE))
    }
    return(as.data.frame(haven::read_dta(path), stringsAsFactors = FALSE))
  }

  stop(sprintf("Unsupported NHIS input format: %s", path), call. = FALSE)
}

read_lmf_input <- function(path) {
  layout <- data.frame(
    source = c(
      "PUBLICID", "ELIGSTAT", "MORTSTAT", "UCOD_LEADING", "DIABETES",
      "HYPERTEN", "DODQTR", "DODYEAR", "WGT_NEW", "SA_WGT_NEW"
    ),
    start = c(1L, 15L, 16L, 17L, 20L, 21L, 22L, 23L, 27L, 35L),
    end = c(14L, 15L, 16L, 19L, 20L, 21L, 22L, 26L, 34L, 42L),
    stringsAsFactors = FALSE
  )
  read_fixed_width_columns(path, layout, layout$source)
}

load_year_inputs <- function(nhis_path, sas_layout_path, lmf_path, variable_map, year) {
  nhis_mapping <- get_year_mapping(variable_map, year)
  validate_lmf_mapping(variable_map$linked_mortality_2019)

  list(
    nhis = read_nhis_input(nhis_path, sas_layout_path, nhis_mapping, year),
    mortality = read_lmf_input(lmf_path)
  )
}
