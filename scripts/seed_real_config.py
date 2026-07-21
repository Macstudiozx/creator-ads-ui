#!/usr/bin/env python3
"""Seed real ATTOP99 account + shorthand config into Supabase.

Uses backend-only SUPABASE_SERVICE_ROLE_KEY from .env.engine. This does not put
service_role in the Web UI.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def read_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


env = {**read_env(ROOT / '.env.local'), **read_env(ROOT / '.env.engine')}
url = os.getenv('SUPABASE_URL') or env.get('NEXT_PUBLIC_SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY')
if not url or not key:
    raise SystemExit('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

base = url.rstrip('/') + '/rest/v1'
headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
}


def req(method: str, path: str, body: Any = None, prefer: str = 'return=representation') -> Any:
    h = dict(headers)
    if prefer:
        h['Prefer'] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
    r = urllib.request.Request(base + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            txt = resp.read().decode('utf-8')
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path} HTTP {e.code}: {e.read().decode()}') from e


accounts = [
    {
        'brand': 'DRJADE',
        'product': 'DRJADE',
        'account_label': 'DR.JADE',
        'act_id': '26998284149780179',
        'page_ids': ['1109300358937997'],
        'default_page_id': '1109300358937997',
        'pixel_id': '2287994378265905',
        'owner': 'ATT0P99',
        'active': True,
    },
    {
        'brand': 'HMO',
        'product': 'HMO',
        'account_label': 'HAPPY Life',
        'act_id': '603593437444446',
        'page_ids': ['246993791830119'],
        'default_page_id': '246993791830119',
        'pixel_id': '2287994378265905',
        'owner': 'Mac',
        'active': True,
    },
    {
        'brand': 'HMO',
        'product': 'HMO',
        'account_label': 'อายุยืน',
        'act_id': '1550298176199324',
        'page_ids': ['562856163570302'],
        'default_page_id': '562856163570302',
        'pixel_id': None,
        'owner': 'Mac',
        'active': True,
    },
    {
        'brand': 'ASTA',
        'product': 'ASTA',
        'account_label': 'KENG ASTA',
        'act_id': '828326256875829',
        'page_ids': ['561045733764039'],
        'default_page_id': '561045733764039',
        'pixel_id': None,
        'owner': 'Keng',
        'active': True,
    },
    {
        'brand': 'ASTA',
        'product': 'ASTA',
        'account_label': 'สุขภาพดี',
        'act_id': '828326256875829',
        'page_ids': ['561045733764039'],
        'default_page_id': '561045733764039',
        'pixel_id': None,
        'owner': 'Mik',
        'active': True,
    },
    {
        'brand': 'OMG',
        'product': 'OMG',
        'account_label': 'MIK OMG',
        'act_id': '1415468563577423',
        'page_ids': ['617344948123314'],
        'default_page_id': '617344948123314',
        'pixel_id': None,
        'owner': 'Mik',
        'active': True,
    },
    {
        'brand': 'OMG',
        'product': 'OMG',
        'account_label': 'คุยเฟื่อง',
        'act_id': '1415468563577423',
        'page_ids': ['617344948123314'],
        'default_page_id': '617344948123314',
        'pixel_id': None,
        'owner': 'Mik',
        'active': True,
    },
]

shorthands = [
    {
        'code': 'ENG-LEAD',
        'funnel': 'TOF',
        'objective': 'OUTCOME_ENGAGEMENT',
        'optimization_goal': 'LEAD_GENERATION',
        'destination_type': 'MESSENGER',
        'regen_slot': 'tof_eng_lead',
        'allowed_funnels': ['TOF', 'MOF'],
        'active': True,
    },
    {
        'code': 'LEAD-LEAD',
        'funnel': 'TOF',
        'objective': 'OUTCOME_LEADS',
        'optimization_goal': 'LEAD_GENERATION',
        'destination_type': 'MESSENGER',
        'regen_slot': 'tof_lead_lead',
        'allowed_funnels': ['TOF'],
        'active': True,
    },
    {
        'code': 'ENG-PTM',
        'funnel': 'BOF',
        'objective': 'OUTCOME_ENGAGEMENT',
        'optimization_goal': 'MESSAGING_PURCHASE_CONVERSION',
        'destination_type': 'MESSENGER',
        'regen_slot': 'bof_eng_ptm',
        'allowed_funnels': ['BOF'],
        'active': True,
    },
    {
        'code': 'ENG-CHAT',
        'funnel': 'MOF',
        'objective': 'OUTCOME_ENGAGEMENT',
        'optimization_goal': 'CONVERSATIONS',
        'destination_type': 'MESSENGER',
        'regen_slot': 'mof_eng_chat',
        'allowed_funnels': ['MOF', 'BOF'],
        'active': True,
    },
    {
        'code': 'Sales-PTM',
        'funnel': 'BOF',
        'objective': 'OUTCOME_SALES',
        'optimization_goal': 'MESSAGING_PURCHASE_CONVERSION',
        'destination_type': 'MESSENGER',
        'regen_slot': 'bof_sales_ptm',
        'allowed_funnels': ['BOF'],
        'active': True,
    },
]

req('POST', '/accounts?on_conflict=account_label', accounts, 'resolution=merge-duplicates,return=representation')
req('POST', '/shorthands?on_conflict=code', shorthands, 'resolution=merge-duplicates,return=representation')

counts = {
    'accounts': req('GET', '/accounts?select=account_label,brand,product,act_id,page_ids,pixel_id&order=brand.asc,account_label.asc'),
    'shorthands': req('GET', '/shorthands?select=code,funnel,objective,optimization_goal,regen_slot&order=code.asc'),
}
print(json.dumps(counts, ensure_ascii=False, indent=2))
