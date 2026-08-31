#!/usr/bin/env python3
"""Validate an SSA period life table runtime artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from fetch_table4c6 import canonical_checksum

REQUIRED_TOP_LEVEL_KEYS = {
    "schemaVersion",
    "artifactType",
    "sourceUrl",
    "mortalityYear",
    "trusteesReportYear",
    "retrievedAt",
    "supportedAgeRange",
    "units",
    "checksumSha256",
    "data",
}

SPOT_QX = {
    "male": {0: 0.006015, 65: 0.016455, 95: 0.262268, 110: 0.597297, 119: 0.926604},
    "female": {0: 0.005125, 65: 0.010188, 95: 0.216846, 110: 0.597297, 119: 0.926604},
}


class ArtifactValidationError(Exception):
    pass


def verify_artifact(artifact: dict) -> None:
    missing = REQUIRED_TOP_LEVEL_KEYS - set(artifact)
    if missing:
        raise ArtifactValidationError(f"Missing top-level keys: {sorted(missing)}")

    if artifact["schemaVersion"] != 1:
        raise ArtifactValidationError(f"Unsupported schemaVersion: {artifact['schemaVersion']}")
    if artifact["artifactType"] != "ssa-period-life-table":
        raise ArtifactValidationError(f"Unexpected artifactType: {artifact['artifactType']}")
    if artifact["sourceUrl"] != "https://www.ssa.gov/oact/STATS/table4c6.html":
        raise ArtifactValidationError(f"Unexpected sourceUrl: {artifact['sourceUrl']}")
    if artifact["mortalityYear"] != 2023:
        raise ArtifactValidationError(f"Unexpected mortalityYear: {artifact['mortalityYear']}")
    if artifact["trusteesReportYear"] != 2026:
        raise ArtifactValidationError(f"Unexpected trusteesReportYear: {artifact['trusteesReportYear']}")
    if artifact["supportedAgeRange"] != [0, 119]:
        raise ArtifactValidationError(f"Unexpected supportedAgeRange: {artifact['supportedAgeRange']}")
    if artifact["units"] != "one-year probability of death":
        raise ArtifactValidationError(f"Unexpected units: {artifact['units']}")

    data = artifact["data"]
    for sex in ("male", "female"):
        if sex not in data:
            raise ArtifactValidationError(f"Missing sex: {sex}")
        rows = data[sex]
        if len(rows) != 120:
            raise ArtifactValidationError(f"{sex}: expected 120 rows, got {len(rows)}")
        ages = [row["age"] for row in rows]
        if ages != list(range(120)):
            raise ArtifactValidationError(f"{sex}: ages must be 0–119 in order")
        for row in rows:
            if not (0 <= row["qx"] <= 1):
                raise ArtifactValidationError(f"{sex} age {row['age']}: qx out of range")
            if row["lx"] < 0:
                raise ArtifactValidationError(f"{sex} age {row['age']}: lx must be non-negative")

    expected_checksum = canonical_checksum(data)
    if artifact["checksumSha256"] != expected_checksum:
        raise ArtifactValidationError(
            "checksumSha256 does not match canonical data payload "
            f"(expected {expected_checksum}, got {artifact['checksumSha256']})"
        )

    for sex, values in SPOT_QX.items():
        for age, expected_qx in values.items():
            actual_qx = data[sex][age]["qx"]
            if actual_qx != expected_qx:
                raise ArtifactValidationError(
                    f"{sex} age {age}: expected qx={expected_qx}, got {actual_qx}"
                )


def load_artifact(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify SSA period life table artifact")
    parser.add_argument("artifact", type=Path, help="Path to JSON artifact")
    args = parser.parse_args(argv)

    artifact = load_artifact(args.artifact)
    try:
        verify_artifact(artifact)
    except ArtifactValidationError as exc:
        print(f"Verification failed: {exc}", file=sys.stderr)
        return 1

    row_count = len(artifact["data"]["male"]) + len(artifact["data"]["female"])
    print(f"Verified {args.artifact}")
    print(f"  rows: {row_count}")
    print(f"  ages: 0–119 (male and female)")
    print(f"  checksumSha256: {artifact['checksumSha256']}")
    print("  spot values at ages 0, 65, 95, 110, 119: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
