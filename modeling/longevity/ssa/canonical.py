"""Language-neutral canonical encoding for SSA mortality artifact checksums."""

from __future__ import annotations

import hashlib

SEX_ORDER = ("male", "female")


def canonical_row_line(sex: str, age: int, qx: float, lx: int, ex: float) -> str:
    return f"{sex}|{age}|{qx:.6f}|{lx}|{ex:.2f}\n"


def canonical_payload(data: dict) -> bytes:
    lines: list[str] = []
    for sex in SEX_ORDER:
        rows = data[sex]
        if len(rows) != 120:
            raise ValueError(f"{sex}: expected 120 rows, got {len(rows)}")
        for row in rows:
            lines.append(
                canonical_row_line(sex, row["age"], row["qx"], row["lx"], row["ex"])
            )
    return "".join(lines).encode("utf-8")


def canonical_checksum(data: dict) -> str:
    return hashlib.sha256(canonical_payload(data)).hexdigest()
