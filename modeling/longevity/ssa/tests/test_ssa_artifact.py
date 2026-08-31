import json
from pathlib import Path

from canonical import canonical_payload, canonical_row_line
from fetch_table4c6 import parse_table
from verify_artifact import SPOT_QX, verify_artifact

REPO_ROOT = Path(__file__).resolve().parents[4]
PRODUCTION_ARTIFACT = REPO_ROOT / "frontend/src/data/mortality/ssa-period-life-table-2023.json"


def test_parse_table_returns_all_ages_for_both_sexes(ssa_html):
    artifact = parse_table(ssa_html, retrieved_at="2026-08-31")
    assert [row["age"] for row in artifact["data"]["male"]] == list(range(120))
    assert [row["age"] for row in artifact["data"]["female"]] == list(range(120))
    assert all(
        0 <= row["qx"] <= 1
        for sex in ("male", "female")
        for row in artifact["data"][sex]
    )


def test_checksum_covers_only_canonical_data_payload(ssa_html):
    first = parse_table(ssa_html, retrieved_at="2026-08-31")
    second = parse_table(ssa_html, retrieved_at="2026-09-01")
    assert first["checksumSha256"] == second["checksumSha256"]


def test_canonical_row_encoding_is_language_neutral():
    assert canonical_row_line("male", 0, 0.006015, 100000, 75.79) == (
        "male|0|0.006015|100000|75.79\n"
    )
    assert canonical_row_line("female", 65, 0.010188, 87399, 20.66) == (
        "female|65|0.010188|87399|20.66\n"
    )


def test_canonical_payload_orders_rows_male_then_female_by_age(ssa_html):
    artifact = parse_table(ssa_html, retrieved_at="2026-08-31")
    payload = canonical_payload(artifact["data"]).decode("utf-8")
    lines = payload.splitlines()
    assert len(lines) == 240
    assert lines[0] == "male|0|0.006015|100000|75.79"
    assert lines[119] == "male|119|0.926604|0|0.58"
    assert lines[120] == "female|0|0.005125|100000|81.06"
    assert lines[239] == "female|119|0.926604|0|0.58"


def test_official_spot_values_match_source(ssa_html):
    artifact = parse_table(ssa_html, retrieved_at="2026-08-31")
    for sex, values in SPOT_QX.items():
        for age, qx in values.items():
            assert artifact["data"][sex][age]["qx"] == qx


def test_production_artifact_passes_verifier():
    artifact = json.loads(PRODUCTION_ARTIFACT.read_text(encoding="utf-8"))
    verify_artifact(artifact)


def test_production_artifact_pins_schema_checksum_and_spot_values():
    artifact = json.loads(PRODUCTION_ARTIFACT.read_text(encoding="utf-8"))

    assert artifact["schemaVersion"] == 1
    assert artifact["artifactType"] == "ssa-period-life-table"
    assert artifact["sourceUrl"] == "https://www.ssa.gov/oact/STATS/table4c6.html"
    assert artifact["mortalityYear"] == 2023
    assert artifact["trusteesReportYear"] == 2026
    assert artifact["retrievedAt"] == "2026-08-31"
    assert artifact["supportedAgeRange"] == [0, 119]
    assert artifact["units"] == "one-year probability of death"
    assert (
        artifact["checksumSha256"]
        == "0633dca104495208a36f0413d0fa6f492d489a4a7a13c491f5102e44ff84f715"
    )

    for sex, values in SPOT_QX.items():
        for age, qx in values.items():
            assert artifact["data"][sex][age]["qx"] == qx
