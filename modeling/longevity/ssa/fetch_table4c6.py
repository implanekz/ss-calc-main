#!/usr/bin/env python3
"""Fetch and parse the SSA 2023 period life table (table4c6)."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

SOURCE_URL = "https://www.ssa.gov/oact/STATS/table4c6.html"
EXPECTED_MORTALITY_YEAR = 2023
EXPECTED_TRUSTEES_REPORT_YEAR = 2026


def canonical_checksum(data: dict) -> str:
    payload = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_artifact(rows: dict, retrieved_at: str) -> dict:
    data = {
        sex: [
            {"age": age, "qx": values["qx"], "lx": values["lx"], "ex": values["ex"]}
            for age, values in sorted(rows[sex].items())
        ]
        for sex in ("male", "female")
    }
    return {
        "schemaVersion": 1,
        "artifactType": "ssa-period-life-table",
        "sourceUrl": SOURCE_URL,
        "mortalityYear": EXPECTED_MORTALITY_YEAR,
        "trusteesReportYear": EXPECTED_TRUSTEES_REPORT_YEAR,
        "retrievedAt": retrieved_at,
        "supportedAgeRange": [0, 119],
        "units": "one-year probability of death",
        "checksumSha256": canonical_checksum(data),
        "data": data,
    }


def _parse_number(value: str) -> float:
    return float(value.replace(",", "").strip())


def _parse_lx(value: str) -> int:
    return int(value.replace(",", "").strip())


_ROW_PATTERN = re.compile(
    r"<tr[^>]*>\s*"
    r"<td[^>]*>\s*(\d+)\s*</td>\s*"
    r"<td>\s*([\d.]+)\s*</td>\s*"
    r"<td>\s*([\d,]+)\s*</td>\s*"
    r"<td>\s*([\d.]+)\s*</td>\s*"
    r"<td>\s*([\d.]+)\s*</td>\s*"
    r"<td>\s*([\d,]+)\s*</td>\s*"
    r"<td>\s*([\d.]+)\s*</td>\s*"
    r"</tr>",
    re.IGNORECASE,
)


def _extract_life_table_rows(html: str) -> list[list[str]]:
    marker = "Period Life Table, 2023"
    if marker not in html:
        raise ValueError("HTML does not contain the 2023 period life table")

    section = html.split(marker, 1)[1]
    table_match = re.search(r"<table[^>]*>(.*?)</table>", section, re.DOTALL | re.IGNORECASE)
    if not table_match:
        raise ValueError("No life-table HTML found after 2023 period life table heading")

    table_html = table_match.group(1)
    rows = [list(match.groups()) for match in _ROW_PATTERN.finditer(table_html)]
    if not rows:
        raise ValueError("No life-table data rows found in HTML")
    return rows


def parse_table(html: str, retrieved_at: str) -> dict:
    raw_rows = _extract_life_table_rows(html)
    parsed: dict[str, dict[int, dict[str, float | int]]] = {"male": {}, "female": {}}

    for cells in raw_rows:
        if len(cells) != 7:
            raise ValueError(f"Expected 7 columns per row, got {len(cells)}: {cells!r}")

        age = int(cells[0].strip())
        if age < 0 or age > 119:
            raise ValueError(f"Age out of supported range: {age}")

        male = {
            "qx": _parse_number(cells[1]),
            "lx": _parse_lx(cells[2]),
            "ex": _parse_number(cells[3]),
        }
        female = {
            "qx": _parse_number(cells[4]),
            "lx": _parse_lx(cells[5]),
            "ex": _parse_number(cells[6]),
        }

        for sex, values in (("male", male), ("female", female)):
            if age in parsed[sex]:
                raise ValueError(f"Duplicate age {age} for {sex}")
            parsed[sex][age] = values

    for sex in ("male", "female"):
        missing = [age for age in range(120) if age not in parsed[sex]]
        if missing:
            raise ValueError(f"Missing ages for {sex}: {missing[:5]}{'...' if len(missing) > 5 else ''}")

    return build_artifact(parsed, retrieved_at)


def fetch_html(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def write_artifact(artifact: dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)
        handle.write("\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch and parse SSA table4c6 life table")
    parser.add_argument("--url", default=SOURCE_URL, help="Official SSA table URL")
    parser.add_argument("--input", type=Path, help="Local HTML snapshot instead of URL")
    parser.add_argument("--retrieved-at", required=True, help="Retrieval date (YYYY-MM-DD)")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON artifact path")
    parser.add_argument(
        "--fixture",
        type=Path,
        help="Optional path to save fetched HTML for offline tests",
    )
    args = parser.parse_args(argv)

    if args.input:
        html = args.input.read_text(encoding="utf-8")
    else:
        html = fetch_html(args.url)

    if args.fixture:
        args.fixture.parent.mkdir(parents=True, exist_ok=True)
        args.fixture.write_text(html, encoding="utf-8")

    artifact = parse_table(html, retrieved_at=args.retrieved_at)
    write_artifact(artifact, args.output)
    print(f"Wrote {args.output} ({len(artifact['data']['male']) + len(artifact['data']['female'])} rows)")
    print(f"checksumSha256={artifact['checksumSha256']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
