"""
Earnings record persistence.
Handles: read, upsert, delete of a user's (and partner's) SSA earnings history.
"""
from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from supabase import Client

from api.children import get_user_id_from_token_sync
from config.supabase import get_supabase_client

router = APIRouter(prefix="/api/earnings", tags=["earnings"])
supabase: Client = get_supabase_client()


class EarningsRow(BaseModel):
    year: int = Field(..., ge=1937, le=2100)
    earnings: float = Field(..., ge=0)
    is_projected: bool = False


class EarningsRecordIn(BaseModel):
    birth_year: int = Field(..., ge=1937, le=2010)
    rows: List[EarningsRow]
    statement_date: Optional[date] = None


class EarningsRecordOut(BaseModel):
    person: str
    birth_year: int
    rows: List[EarningsRow]
    updated_at: str
    statement_date: Optional[date] = None


Person = Literal["self", "partner"]


def _require_user_id(request: Request) -> str:
    """
    get_user_id_from_token_sync returns None rather than raising, so every
    route must convert that into a 401 — the same pattern used in children.py.
    """
    user_id = get_user_id_from_token_sync(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user_id


@router.get("")
async def get_earnings(request: Request):
    user_id = _require_user_id(request)
    response = (
        supabase.table("earnings_records")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    earnings = [
        EarningsRecordOut(
            person=row["person"],
            birth_year=row["birth_year"],
            rows=row["rows"],
            updated_at=str(row.get("updated_at") or ""),
            statement_date=row.get("statement_date"),
        )
        for row in (response.data or [])
    ]
    return {"earnings": earnings}


@router.put("/{person}", response_model=EarningsRecordOut)
async def upsert_earnings(person: Person, payload: EarningsRecordIn, request: Request):
    user_id = _require_user_id(request)
    record = {
        "user_id": user_id,
        "person": person,
        "birth_year": payload.birth_year,
        "rows": [row.model_dump() for row in payload.rows],
        "statement_date": payload.statement_date.isoformat() if payload.statement_date else None,
    }
    response = (
        supabase.table("earnings_records")
        .upsert(record, on_conflict="user_id,person")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to save earnings record")

    saved = response.data[0]
    return EarningsRecordOut(
        person=saved["person"],
        birth_year=saved["birth_year"],
        rows=saved["rows"],
        updated_at=str(saved.get("updated_at") or ""),
        statement_date=saved.get("statement_date"),
    )


@router.delete("/{person}")
async def delete_earnings(person: Person, request: Request):
    user_id = _require_user_id(request)
    (
        supabase.table("earnings_records")
        .delete()
        .eq("user_id", user_id)
        .eq("person", person)
        .execute()
    )
    return {"success": True}
