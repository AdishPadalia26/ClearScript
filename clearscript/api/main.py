from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="ClearScript API", version="0.1.0")


class FaxUpload(BaseModel):
    fax_id: str
    filename: str


class ApproveOrder(BaseModel):
    approved_by: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/faxes")
def upload_fax(payload: FaxUpload) -> dict[str, str]:
    return {"status": "received", "fax_id": payload.fax_id, "filename": payload.filename}


@app.get("/orders")
def list_orders() -> list[dict[str, str]]:
    return [{"order_id": "demo-order-001", "status": "needs_review"}]


@app.get("/orders/{order_id}")
def get_order(order_id: str) -> dict[str, str]:
    if order_id == "demo-order-001":
        return {"order_id": order_id, "status": "needs_review", "drug": "metformin"}
    raise HTTPException(status_code=404, detail="Order not found")


@app.post("/orders/{order_id}/approve")
def approve_order(order_id: str, payload: ApproveOrder) -> dict[str, str]:
    return {"status": "approved", "order_id": order_id, "approved_by": payload.approved_by}
