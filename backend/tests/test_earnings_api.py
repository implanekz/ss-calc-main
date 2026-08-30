import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "dummy-test-key")

import pytest
from fastapi.testclient import TestClient
from backend.core.integrated_ss_api import app

# Same module object the running app's route handlers were bound from
# (integrated_ss_api.py bootstraps sys.path and does a bare `from api.earnings
# import router`, so `api.earnings` — not `backend.api.earnings` — is the
# instance in sys.modules that the endpoints actually reference).
import api.earnings as earnings_module

client = TestClient(app)


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    """Minimal stand-in for a supabase-py query builder: every builder
    method just records the call and returns self for chaining, and
    execute() returns the data the test configured."""

    def __init__(self, data):
        self._data = data
        self.calls = []

    def select(self, *args, **kwargs):
        self.calls.append(("select", args, kwargs))
        return self

    def eq(self, *args, **kwargs):
        self.calls.append(("eq", args, kwargs))
        return self

    def upsert(self, *args, **kwargs):
        self.calls.append(("upsert", args, kwargs))
        return self

    def delete(self, *args, **kwargs):
        self.calls.append(("delete", args, kwargs))
        return self

    def execute(self):
        return _FakeResult(self._data)


class _FakeSupabase:
    def __init__(self, data):
        self._data = data
        self.last_query = None

    def table(self, name):
        self.table_name = name
        self.last_query = _FakeQuery(self._data)
        return self.last_query


AUTH_HEADERS = {"Authorization": "Bearer fake-token"}


def test_put_earnings_rejects_unknown_person():
    response = client.put(
        "/api/earnings/cousin",
        json={"birth_year": 1965, "rows": []},
    )
    assert response.status_code == 422


def test_put_earnings_rejects_birth_year_out_of_range():
    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 1800, "rows": []},
    )
    assert response.status_code == 422


def test_put_earnings_rejects_negative_earnings():
    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 1965, "rows": [{"year": 2020, "earnings": -5}]},
    )
    assert response.status_code == 422


def test_put_earnings_requires_authentication():
    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 1965, "rows": [{"year": 2020, "earnings": 50000}]},
    )
    assert response.status_code == 401


def test_get_earnings_requires_authentication():
    assert client.get("/api/earnings").status_code == 401


def test_delete_earnings_requires_authentication():
    assert client.delete("/api/earnings/self").status_code == 401


def test_put_earnings_rejects_birth_year_above_range():
    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 2011, "rows": []},
    )
    assert response.status_code == 422


def test_put_earnings_rejects_row_year_below_range():
    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 1965, "rows": [{"year": 1936, "earnings": 100}]},
    )
    assert response.status_code == 422


def test_put_earnings_rejects_row_year_above_range():
    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 1965, "rows": [{"year": 2101, "earnings": 100}]},
    )
    assert response.status_code == 422


def test_put_earnings_self_round_trip(monkeypatch):
    monkeypatch.setattr(
        earnings_module, "get_user_id_from_token_sync", lambda request: "user-123"
    )
    fake = _FakeSupabase(
        data=[
            {
                "person": "self",
                "birth_year": 1965,
                "rows": [{"year": 2020, "earnings": 50000.0, "is_projected": False}],
                "updated_at": "2026-08-01T00:00:00+00:00",
                "id": "row-id",
                "user_id": "user-123",
                "source": "ssa_xml",
            }
        ]
    )
    monkeypatch.setattr(earnings_module, "supabase", fake)

    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 1965, "rows": [{"year": 2020, "earnings": 50000}]},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    assert response.json() == {
        "person": "self",
        "birth_year": 1965,
        "rows": [{"year": 2020, "earnings": 50000.0, "is_projected": False}],
        "updated_at": "2026-08-01T00:00:00+00:00",
        "statement_date": None,
    }
    call_names = [name for name, _, _ in fake.last_query.calls]
    assert call_names[0] == "upsert"
    upsert_kwargs = fake.last_query.calls[0][2]
    assert upsert_kwargs.get("on_conflict") == "user_id,person"
    upsert_record = fake.last_query.calls[0][1][0]
    assert upsert_record == {
        "user_id": "user-123",
        "person": "self",
        "birth_year": 1965,
        "rows": [{"year": 2020, "earnings": 50000.0, "is_projected": False}],
        "statement_date": None,
    }


def test_put_earnings_partner_round_trip(monkeypatch):
    monkeypatch.setattr(
        earnings_module, "get_user_id_from_token_sync", lambda request: "user-123"
    )
    fake = _FakeSupabase(
        data=[
            {
                "person": "partner",
                "birth_year": 1968,
                "rows": [{"year": 2021, "earnings": 40000.0, "is_projected": True}],
                "updated_at": "2026-08-01T00:00:00+00:00",
            }
        ]
    )
    monkeypatch.setattr(earnings_module, "supabase", fake)

    response = client.put(
        "/api/earnings/partner",
        json={
            "birth_year": 1968,
            "rows": [{"year": 2021, "earnings": 40000, "is_projected": True}],
        },
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    assert response.json() == {
        "person": "partner",
        "birth_year": 1968,
        "rows": [{"year": 2021, "earnings": 40000.0, "is_projected": True}],
        "updated_at": "2026-08-01T00:00:00+00:00",
        "statement_date": None,
    }


def test_put_earnings_returns_500_when_upsert_yields_no_data(monkeypatch):
    monkeypatch.setattr(
        earnings_module, "get_user_id_from_token_sync", lambda request: "user-123"
    )
    fake = _FakeSupabase(data=[])
    monkeypatch.setattr(earnings_module, "supabase", fake)

    response = client.put(
        "/api/earnings/self",
        json={"birth_year": 1965, "rows": [{"year": 2020, "earnings": 50000}]},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 500


def test_get_earnings_returns_mapped_envelope(monkeypatch):
    monkeypatch.setattr(
        earnings_module, "get_user_id_from_token_sync", lambda request: "user-123"
    )
    fake = _FakeSupabase(
        data=[
            {
                "person": "self",
                "birth_year": 1965,
                "rows": [{"year": 2020, "earnings": 50000.0, "is_projected": False}],
                "updated_at": "2026-08-01T00:00:00+00:00",
                # Raw-row-only fields that must NOT leak into the response.
                "id": "row-id",
                "user_id": "user-123",
                "source": "ssa_xml",
                "created_at": "2026-01-01T00:00:00+00:00",
            }
        ]
    )
    monkeypatch.setattr(earnings_module, "supabase", fake)

    response = client.get("/api/earnings", headers=AUTH_HEADERS)

    assert response.status_code == 200
    assert response.json() == {
        "earnings": [
            {
                "person": "self",
                "birth_year": 1965,
                "rows": [{"year": 2020, "earnings": 50000.0, "is_projected": False}],
                "updated_at": "2026-08-01T00:00:00+00:00",
                "statement_date": None,
            }
        ]
    }


def test_put_earnings_persists_statement_date(monkeypatch):
    monkeypatch.setattr(
        earnings_module, "get_user_id_from_token_sync", lambda request: "user-123"
    )
    fake = _FakeSupabase(
        data=[
            {
                "person": "self",
                "birth_year": 1965,
                "rows": [{"year": 2020, "earnings": 50000.0, "is_projected": False}],
                "updated_at": "2026-08-01T00:00:00+00:00",
                "statement_date": "2024-10-01",
            }
        ]
    )
    monkeypatch.setattr(earnings_module, "supabase", fake)

    response = client.put(
        "/api/earnings/self",
        json={
            "birth_year": 1965,
            "rows": [{"year": 2020, "earnings": 50000}],
            "statement_date": "2024-10-01",
        },
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["statement_date"] == "2024-10-01"
    upsert_record = fake.last_query.calls[0][1][0]
    assert upsert_record["statement_date"] == "2024-10-01"
