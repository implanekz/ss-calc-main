# SSA 2023 Period Life Table Artifact

This directory builds the verified runtime artifact consumed by the longevity engine.

## Source

- **Official page:** [SSA Period Life Table, 2023 (2026 Trustees Report)](https://www.ssa.gov/oact/STATS/table4c6.html)
- **Mortality year:** 2023
- **Trustees report year:** 2026
- **Population:** Social Security area
- **Age range:** 0–119 (exact age, both sexes)

## Pipeline

1. **Fetch and parse** the official HTML table:

```bash
python modeling/longevity/ssa/fetch_table4c6.py \
  --url https://www.ssa.gov/oact/STATS/table4c6.html \
  --retrieved-at YYYY-MM-DD \
  --output frontend/src/data/mortality/ssa-period-life-table-2023.json
```

Use `--input path/to/table4c6.html` instead of `--url` to parse a local snapshot.

2. **Verify** schema, checksum, age coverage, and official spot values:

```bash
python modeling/longevity/ssa/verify_artifact.py \
  frontend/src/data/mortality/ssa-period-life-table-2023.json
```

3. **Run regression tests:**

```bash
python -m pytest modeling/longevity/ssa/tests/test_ssa_artifact.py -q
```

## Artifact schema

The JSON artifact includes provenance metadata and a canonical SHA-256 checksum over the `data` payload only. Each sex contains 120 rows with:

| Field | Description |
|-------|-------------|
| `age` | Exact age (0–119) |
| `qx` | One-year probability of death |
| `lx` | Number of survivors out of 100,000 born alive |
| `ex` | Remaining period life expectancy (years) |

## Canonical checksum

`checksumSha256` is the SHA-256 hex digest of a language-neutral UTF-8 payload derived from `data` only (metadata such as `retrievedAt` is excluded). The payload is built by emitting one line per row in sex order (`male`, then `female`) and age order (`0`–`119`):

```
sex|age|qx-six-decimals|lx-integer|ex-two-decimals\n
```

Examples:

```
male|0|0.006015|100000|75.79\n
female|65|0.010188|87399|20.66\n
```

Formatting rules:

- `qx`: fixed six digits after the decimal point (e.g. `0.000320` → `0.000320`)
- `lx`: decimal integer with no separators
- `ex`: fixed two digits after the decimal point

The same canonicalizer (`modeling/longevity/ssa/canonical.py`) is used during artifact generation and verification so Python and JavaScript runtimes can reproduce the checksum independently of JSON float serialization.

## Spot-check values

These `qx` values are pinned in tests and verification:

| Age | Male | Female |
|-----|------|--------|
| 0 | 0.006015 | 0.005125 |
| 65 | 0.016455 | 0.010188 |
| 95 | 0.262268 | 0.216846 |
| 110 | 0.597297 | 0.597297 |
| 119 | 0.926604 | 0.926604 |

## Regenerating the test fixture

To refresh the offline HTML fixture used by pytest:

```bash
python modeling/longevity/ssa/fetch_table4c6.py \
  --url https://www.ssa.gov/oact/STATS/table4c6.html \
  --retrieved-at YYYY-MM-DD \
  --output /tmp/ssa-artifact.json \
  --fixture modeling/longevity/ssa/tests/fixtures/table4c6.html
```
