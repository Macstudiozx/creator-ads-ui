#!/usr/bin/env python3
"""Mock Python engine for ATTOP99 Creator Ads UI.

This script simulates the real backend engine by writing progress_events and a
proposal for a batch. It uses the Supabase service_role key because the Web UI
RLS intentionally blocks client-side writes to progress_events/proposals.

Usage:
  SUPABASE_SERVICE_ROLE_KEY=... npm run mock:engine -- <batch_id>
  SUPABASE_SERVICE_ROLE_KEY=... npm run mock:engine          # latest pending/analyzing batch

Never put SUPABASE_SERVICE_ROLE_KEY in .env.local or any NEXT_PUBLIC_* env.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL = ROOT / ".env.local"
ENV_ENGINE = ROOT / ".env.engine"


def read_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = {**read_env_file(ENV_LOCAL), **read_env_file(ENV_ENGINE)}
SUPABASE_URL = os.getenv("SUPABASE_URL") or ENV.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ENV.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or "<<" in SUPABASE_URL:
    print("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL in .env.local or SUPABASE_URL env", file=sys.stderr)
    sys.exit(2)
if not SERVICE_KEY:
    print("ERROR: Missing SUPABASE_SERVICE_ROLE_KEY env. This mock engine needs service_role because RLS blocks progress_events/proposals writes from the Web UI.", file=sys.stderr)
    print("Example: SUPABASE_SERVICE_ROLE_KEY='...' npm run mock:engine -- <batch_id>", file=sys.stderr)
    sys.exit(2)

BASE = SUPABASE_URL.rstrip("/") + "/rest/v1"
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def request(method: str, path: str, body: Any | None = None, prefer: str | None = None) -> Any:
    headers = dict(HEADERS)
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed: HTTP {e.code} {detail}") from e


def q(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def find_batch(batch_id: str | None) -> dict[str, Any]:
    if batch_id:
        rows = request("GET", f"/batches?id=eq.{q(batch_id)}&select=*&limit=1")
    else:
        rows = request(
            "GET",
            "/batches?status=in.(pending_analysis,analyzing,proposed)&select=*&order=created_at.desc&limit=1",
        )
    if not rows:
        raise RuntimeError("No target batch found. Pass a batch_id from /batch/[id].")
    return rows[0]


def get_items(batch_id: str) -> list[dict[str, Any]]:
    rows = request("GET", f"/batch_items?batch_id=eq.{q(batch_id)}&select=*&order=id.asc")
    return rows or []


def next_proposal_version(batch_id: str) -> int:
    rows = request("GET", f"/proposals?batch_id=eq.{q(batch_id)}&select=version&order=version.desc&limit=1")
    return int(rows[0]["version"]) + 1 if rows else 1


def patch_batch(batch_id: str, status: str) -> None:
    request("PATCH", f"/batches?id=eq.{q(batch_id)}", {"status": status})


def insert_event(batch_id: str, seq: int, event: str, payload: dict[str, Any], pause: float = 0.35) -> None:
    request(
        "POST",
        "/progress_events",
        {"batch_id": batch_id, "seq": seq, "event": event, "payload": payload},
        prefer="return=minimal",
    )
    print(f"event {seq:02d} {event} {payload.get('file', '')}")
    time.sleep(pause)


def build_proposal(batch: dict[str, Any], items: list[dict[str, Any]], version: int) -> dict[str, Any]:
    batch_id = batch["id"]
    files = [it.get("ad_code_input") or Path(it.get("media_path", "AD000000")).stem for it in items]
    if not files:
        files = ["AD000133", "AD000141", "AD000147"]

    ads = [
        {
            "ad_code": code,
            "caption": f"{code} — แคปชั่นตัวอย่างจาก mock engine สำหรับตรวจ UI",
            "headline": "ทักแชทรับคำแนะนำ",
            "fda": {"status": "pass"},
        }
        for code in files
    ]
    groups = [
        {
            "funnel": "TOF",
            "campaign_name": f"{batch.get('brand') or 'HMO'} - {batch.get('promo') or 'TEST'} - TOF - ENG-LEAD - Acquire - PainPoint - VDO - MOCK - V01",
            "objective": "OUTCOME_ENGAGEMENT",
            "optimization_goal": "LEAD_GENERATION",
            "daily_budget_thb": 1000,
            "budget_basis": "mock engine: default TOF budget",
            "audience": {
                "include": [{"name": "broad_th_25_65", "kind": "broad"}],
                "exclude": [{"name": "purchasers_180d", "kind": "existing"}],
                "to_create": [],
            },
            "ads": ads,
            "checks": {
                "name_funnel_match": True,
                "blacklist_hit": False,
                "pixel_ok": True,
                "expressway_eligible": False,
            },
        }
    ]
    return {
        "batch_id": batch_id,
        "version": version,
        "plan": {"groups": groups, "hold": []},
        "summary": {
            "campaigns": len(groups),
            "adsets": len(groups),
            "ads_ready": len(ads),
            "budget": sum(int(g["daily_budget_thb"]) for g in groups),
            "hold": 0,
        },
        "expires_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 24 * 3600)),
    }


def main() -> None:
    batch_id_arg = sys.argv[1] if len(sys.argv) > 1 else None
    batch = find_batch(batch_id_arg)
    batch_id = batch["id"]
    items = get_items(batch_id)
    print(f"Mock engine target batch: {batch_id} ({batch.get('code')}) items={len(items)}")

    patch_batch(batch_id, "analyzing")
    insert_event(batch_id, 1, "batch_started", {"total": max(len(items), 1), "source": "mock_engine"})
    seq = 2
    funnels = ["TOF", "MOF", "BOF"]
    for idx, item in enumerate(items or [{"ad_code_input": "AD000133", "media_path": "mock/AD000133.png"}]):
        file_name = item.get("media_path") or item.get("ad_code_input") or f"item-{idx+1}"
        funnel = funnels[idx % len(funnels)]
        insert_event(batch_id, seq, "file_started", {"file": file_name}); seq += 1
        insert_event(batch_id, seq, "classified", {"file": file_name, "funnel": funnel, "confidence": 86 + idx % 10, "source": "mock_engine"}); seq += 1
        insert_event(batch_id, seq, "caption_ready", {"file": file_name, "headline": "ทักแชทรับคำแนะนำ"}, pause=0.2); seq += 1

    version = next_proposal_version(batch_id)
    proposal = build_proposal(batch, items, version)
    request("POST", "/proposals", proposal, prefer="return=representation")
    patch_batch(batch_id, "proposed")
    insert_event(batch_id, seq, "batch_done", {"proposal_version": version, "ads_ready": proposal["summary"]["ads_ready"]}, pause=0)
    print(f"DONE: proposal v{version} created. Open /batch/{batch_id}/review")


if __name__ == "__main__":
    main()
