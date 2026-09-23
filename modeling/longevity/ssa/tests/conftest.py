import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def ssa_html():
    fixture_path = Path(__file__).resolve().parent / "fixtures" / "table4c6.html"
    return fixture_path.read_text(encoding="utf-8")
