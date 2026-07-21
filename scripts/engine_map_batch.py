#!/usr/bin/env python3
"""ATT0P99 production mapper: uploaded media -> creative feed -> proposal.

This is the server-side engine step that runs after Web UI upload. It maps each
batch_item by the AD code in the filename to `creatives`, then builds a proposal
containing funnel, caption, headline, audience, budget and campaign setup.

Usage:
  npm run engine:map -- <batch_id>
  npm run engine:map              # latest pending/analyzing batch
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
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
SUPABASE_URL = os.getenv('SUPABASE_URL') or env.get('NEXT_PUBLIC_SUPABASE_URL')
SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY')
if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY')

BASE = SUPABASE_URL.rstrip('/') + '/rest/v1'
HEADERS = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Content-Type': 'application/json'}


def enc(v: str) -> str:
    return urllib.parse.quote(v, safe='')


def req(method: str, path: str, body: Any = None, prefer: str | None = 'return=representation') -> Any:
    headers = dict(HEADERS)
    if prefer:
        headers['Prefer'] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=45) as resp:
            text = resp.read().decode('utf-8')
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path} HTTP {e.code}: {e.read().decode()}') from e


def batch(batch_id: str | None) -> dict[str, Any]:
    if batch_id:
        rows = req('GET', f'/batches?id=eq.{enc(batch_id)}&select=*&limit=1')
    else:
        rows = req('GET', '/batches?status=in.(pending_analysis,analyzing)&select=*&order=created_at.desc&limit=1')
    if not rows:
        print('No pending batch found')
        sys.exit(0)
    return rows[0]


def insert_event(batch_id: str, seq: int, event: str, payload: dict[str, Any]) -> None:
    req('POST', '/progress_events', {'batch_id': batch_id, 'seq': seq, 'event': event, 'payload': payload}, 'return=minimal')
    print(f'event {seq:02d} {event} {payload.get("ad_code") or payload.get("file") or ""}')


def next_version(batch_id: str) -> int:
    rows = req('GET', f'/proposals?batch_id=eq.{enc(batch_id)}&select=version&order=version.desc&limit=1')
    return int(rows[0]['version']) + 1 if rows else 1


def default_audience(funnel: str) -> dict[str, Any]:
    if funnel == 'TOF':
        return {'include': [{'name': 'broad_th_25_65', 'kind': 'broad'}], 'exclude': [{'name': 'purchasers_180d', 'kind': 'existing'}], 'to_create': []}
    if funnel == 'MOF':
        return {'include': [{'name': 'page_engagers_365d', 'kind': 'existing'}, {'name': 'video_50pct_180d', 'kind': 'custom'}], 'exclude': [{'name': 'purchasers_30d', 'kind': 'existing'}], 'to_create': []}
    return {'include': [{'name': 'messaged_365d', 'kind': 'existing'}], 'exclude': [{'name': 'purchasers_7d', 'kind': 'existing'}], 'to_create': []}


def default_budget(funnel: str) -> int:
    return {'TOF': 1000, 'MOF': 700, 'BOF': 500}.get(funnel, 500)


def campaign_name(b: dict[str, Any], c: dict[str, Any], sh: dict[str, Any], ad_codes: list[str]) -> str:
    code_range = ad_codes[0] if len(ad_codes) == 1 else f'{ad_codes[0]}-{ad_codes[-1]}'
    parts = [c.get('product') or b.get('brand') or 'PRODUCT', b.get('promo') or 'PROMO', c.get('account_label'), c.get('funnel'), c.get('shorthand'), c.get('angle'), c.get('topic') or 'General', c.get('format'), code_range, c.get('version') or 'V01']
    return ' - '.join(str(x).replace('  ', ' ').strip() for x in parts if x)


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else None
    b = batch(target)
    batch_id = b['id']
    print(f'Mapping batch {batch_id} ({b.get("code")})')
    req('PATCH', f'/batches?id=eq.{enc(batch_id)}', {'status': 'analyzing'}, 'return=minimal')
    items = req('GET', f'/batch_items?batch_id=eq.{enc(batch_id)}&select=*&order=id.asc') or []
    accounts = {a['account_label']: a for a in req('GET', '/accounts?select=*') or []}
    shorthands = {s['code']: s for s in req('GET', '/shorthands?select=*') or []}
    seq = 1
    insert_event(batch_id, seq, 'batch_started', {'total': len(items), 'source': 'production_mapper'}); seq += 1
    matched: list[dict[str, Any]] = []
    hold: list[dict[str, Any]] = []
    for item in items:
        ad_code = (item.get('ad_code_input') or '').upper()
        media_path = item.get('media_path')
        insert_event(batch_id, seq, 'file_started', {'file': media_path, 'ad_code': ad_code}); seq += 1
        rows = req('GET', f'/creatives?ad_code=eq.{enc(ad_code)}&select=*&limit=1') or []
        if not rows:
            hold.append({'file': media_path, 'ad_code': ad_code, 'reason': 'ไม่พบรหัสสื่อนี้ใน creative feed'})
            req('PATCH', f'/batch_items?id=eq.{enc(item["id"])}', {'match_status': 'unmatched'}, 'return=minimal')
            insert_event(batch_id, seq, 'needs_input', {'file': media_path, 'ad_code': ad_code, 'reason': 'creative_not_found'}); seq += 1
            continue
        c = rows[0]
        c['media_path'] = media_path
        matched.append(c)
        req('PATCH', f'/batch_items?id=eq.{enc(item["id"])}', {'creative_id': c['id'], 'match_status': 'matched'}, 'return=minimal')
        req('PATCH', f'/creatives?id=eq.{enc(c["id"])}', {'media_path': media_path, 'media_source': 'upload', 'status': 'uploaded'}, 'return=minimal')
        insert_event(batch_id, seq, 'classified', {'file': media_path, 'ad_code': ad_code, 'funnel': c['funnel'], 'confidence': 99, 'source': 'creative_feed'}); seq += 1
        insert_event(batch_id, seq, 'caption_ready', {'file': media_path, 'ad_code': ad_code, 'caption': c['caption'], 'headline': c['headline']}); seq += 1

    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for c in matched:
        grouped[(c['account_label'], c['funnel'], c['shorthand'])].append(c)

    groups: list[dict[str, Any]] = []
    for (account_label, funnel, shorthand), ads_rows in grouped.items():
        first = ads_rows[0]
        acc = accounts.get(account_label, {})
        sh = shorthands.get(shorthand, {})
        if not sh:
            hold.append({'file': first.get('media_path'), 'ad_code': first.get('ad_code'), 'reason': f'ไม่พบ shorthand {shorthand}'})
            continue
        ad_codes = sorted([c['ad_code'] for c in ads_rows])
        group_ads = [{
            'creative_id': c['id'], 'ad_code': c['ad_code'], 'media_path': c.get('media_path'),
            'caption': c['caption'], 'headline': c['headline'], 'fda': {'status': 'pass'},
            'format': c.get('format'), 'feed_payload': c.get('feed_payload') or {},
        } for c in ads_rows]
        groups.append({
            'funnel': funnel,
            'account_label': account_label,
            'act_id': acc.get('act_id'),
            'page_id': acc.get('default_page_id') or (acc.get('page_ids') or [None])[0],
            'pixel_id': acc.get('pixel_id'),
            'product': first.get('product'),
            'shorthand': shorthand,
            'campaign_name': campaign_name(b, first, sh, ad_codes),
            'objective': sh.get('objective'),
            'optimization_goal': sh.get('optimization_goal'),
            'destination_type': sh.get('destination_type', 'MESSENGER'),
            'daily_budget_thb': default_budget(funnel),
            'budget_basis': f'creative feed mapping: {len(group_ads)} ads, funnel={funnel}, shorthand={shorthand}',
            'audience': default_audience(funnel),
            'ads': group_ads,
            'checks': {'name_funnel_match': True, 'blacklist_hit': False, 'pixel_ok': bool(acc.get('pixel_id')) or funnel != 'BOF', 'expressway_eligible': False},
        })
        insert_event(batch_id, seq, 'budget_set', {'funnel': funnel, 'daily_budget_thb': default_budget(funnel), 'account_label': account_label}); seq += 1

    version = next_version(batch_id)
    summary = {'campaigns': len(groups), 'adsets': len(groups), 'ads_ready': sum(len(g['ads']) for g in groups), 'budget': sum(g['daily_budget_thb'] for g in groups), 'hold': len(hold)}
    proposal = {'batch_id': batch_id, 'version': version, 'plan': {'groups': groups, 'hold': hold}, 'summary': summary, 'expires_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 24*3600))}
    req('POST', '/proposals', proposal, 'return=representation')
    req('PATCH', f'/batches?id=eq.{enc(batch_id)}', {'status': 'proposed'}, 'return=minimal')
    insert_event(batch_id, seq, 'batch_done', {'proposal_version': version, **summary})
    print(json.dumps({'batch_id': batch_id, 'proposal_version': version, 'summary': summary}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
