#!/usr/bin/env python3
"""ATT0P99 approval processor: approvals -> Meta Graph API -> results.

Safe production pattern:
- Web UI only inserts approvals.
- This server-side script owns META_ACCESS_TOKEN and calls Graph API.
- Default is dry-run. Use --execute for real Graph API writes.
- Creates Campaign + Ad Set + eligible Ads as PAUSED. Ads require Meta-ready
  media ids in ad feed_payload: image_hash or video_id/object_story_id.

Usage:
  npm run engine:approve                # dry-run latest unprocessed approval
  npm run engine:approve -- --execute   # real Graph API writes, PAUSED only
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
META_TOKEN = os.getenv('META_ACCESS_TOKEN') or os.getenv('ACCESS_TOKEN') or env.get('META_ACCESS_TOKEN') or env.get('ACCESS_TOKEN')
META_VERSION = os.getenv('META_API_VERSION') or env.get('META_API_VERSION') or 'v23.0'
EXECUTE = '--execute' in sys.argv

if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY')
if EXECUTE and not META_TOKEN:
    raise SystemExit('Missing META_ACCESS_TOKEN/ACCESS_TOKEN. Refusing execute mode.')

SB_BASE = SUPABASE_URL.rstrip('/') + '/rest/v1'
SB_HEADERS = {'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Content-Type': 'application/json'}
GRAPH_BASE = f'https://graph.facebook.com/{META_VERSION}'


def enc(v: str) -> str:
    return urllib.parse.quote(str(v), safe='')


def sb(method: str, path: str, body: Any = None, prefer: str | None = 'return=representation') -> Any:
    h = dict(SB_HEADERS)
    if prefer:
        h['Prefer'] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
    r = urllib.request.Request(SB_BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=45) as resp:
            text = resp.read().decode('utf-8')
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'Supabase {method} {path} HTTP {e.code}: {e.read().decode()}') from e


def graph_post(path: str, params: dict[str, Any]) -> dict[str, Any]:
    if not EXECUTE:
        return {'dry_run': True, 'path': path, 'params': {k: v for k, v in params.items() if k != 'access_token'}}
    params = {**params, 'access_token': META_TOKEN}
    data = urllib.parse.urlencode({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for k, v in params.items()}).encode()
    req = urllib.request.Request(GRAPH_BASE + path, data=data, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')
        raise RuntimeError(f'Graph POST {path} HTTP {e.code}: {detail}') from e


def latest_approval() -> dict[str, Any]:
    rows = sb('GET', '/approvals?select=*&order=created_at.desc&limit=20') or []
    for a in rows:
        exists = sb('GET', f'/results?approval_id=eq.{enc(a["id"])}&select=id&limit=1') or []
        if not exists:
            return a
    print('No unprocessed approval found')
    sys.exit(0)


def proposal_for(a: dict[str, Any]) -> dict[str, Any]:
    rows = sb('GET', f'/proposals?batch_id=eq.{enc(a["batch_id"])}&version=eq.{a["proposal_version"]}&select=*&limit=1') or []
    if not rows:
        raise RuntimeError('Proposal not found for approval')
    return rows[0]


def create_campaign(group: dict[str, Any]) -> dict[str, Any]:
    act = str(group['act_id'])
    if not act.startswith('act_'):
        act = 'act_' + act
    return graph_post(f'/{act}/campaigns', {
        'name': group['campaign_name'],
        'objective': group['objective'],
        'status': 'PAUSED',
        'special_ad_categories': [],
        # Meta v23 requires this when budget is controlled at ad set level.
        # Keep False to avoid enabling ad set budget sharing without explicit approval.
        'is_adset_budget_sharing_enabled': False,
    })


def create_adset(group: dict[str, Any], campaign_id: str) -> dict[str, Any]:
    act = str(group['act_id'])
    if not act.startswith('act_'):
        act = 'act_' + act
    daily_budget = max(100, int(group.get('daily_budget_thb') or 500)) * 100
    promoted_object = {'page_id': group.get('page_id')}
    if group.get('pixel_id') and 'PURCHASE' in str(group.get('optimization_goal', '')).upper():
        promoted_object = {'pixel_id': group.get('pixel_id'), 'custom_event_type': 'PURCHASE'}
    return graph_post(f'/{act}/adsets', {
        'name': group['campaign_name'] + ' - AS01',
        'campaign_id': campaign_id,
        'daily_budget': daily_budget,
        'billing_event': 'IMPRESSIONS',
        'optimization_goal': group.get('optimization_goal'),
        'destination_type': group.get('destination_type', 'MESSENGER'),
        'promoted_object': promoted_object,
        'targeting': {'geo_locations': {'countries': ['TH']}, 'age_min': 25, 'age_max': 65},
        'bid_strategy': 'LOWEST_COST_WITHOUT_CAP',
        'status': 'PAUSED',
    })


def maybe_create_ad(group: dict[str, Any], adset_id: str, ad: dict[str, Any]) -> dict[str, Any] | None:
    payload = ad.get('feed_payload') or {}
    act = str(group['act_id'])
    if not act.startswith('act_'):
        act = 'act_' + act
    creative_spec = None
    if payload.get('object_story_id'):
        creative_spec = {'object_story_id': payload['object_story_id']}
    elif payload.get('image_hash'):
        creative_spec = {'object_story_spec': {'page_id': group.get('page_id'), 'link_data': {'message': ad['caption'], 'name': ad['headline'], 'image_hash': payload['image_hash'], 'call_to_action': {'type': 'MESSAGE_PAGE', 'value': {'app_destination': 'MESSENGER'}}}}}
    elif payload.get('video_id'):
        creative_spec = {'object_story_spec': {'page_id': group.get('page_id'), 'video_data': {'video_id': payload['video_id'], 'message': ad['caption'], 'title': ad['headline'], 'call_to_action': {'type': 'MESSAGE_PAGE', 'value': {'app_destination': 'MESSENGER'}}}}}
    else:
        return None
    creative = graph_post(f'/{act}/adcreatives', {'name': ad['ad_code'] + ' creative', **creative_spec})
    creative_id = creative.get('id') or 'DRY_RUN_CREATIVE_ID'
    return graph_post(f'/{act}/ads', {'name': ad['ad_code'], 'adset_id': adset_id, 'creative': {'creative_id': creative_id}, 'status': 'PAUSED'})


def main() -> None:
    approval = latest_approval()
    proposal = proposal_for(approval)
    groups = (proposal.get('plan') or {}).get('groups') or []
    created: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    mode = approval.get('mode')
    print(f'Processing approval {approval["id"]} mode={mode} execute={EXECUTE}')
    if mode != 'create_paused':
        errors.append({'approval_id': approval['id'], 'reason': f'mode {mode} not implemented in this processor'})
    for group in groups if mode == 'create_paused' else []:
        try:
            camp = create_campaign(group)
            campaign_id = camp.get('id') or 'DRY_RUN_CAMPAIGN_ID'
            adset = create_adset(group, campaign_id)
            adset_id = adset.get('id') or 'DRY_RUN_ADSET_ID'
            group_created = {'funnel': group.get('funnel'), 'campaign': camp, 'adset': adset, 'ads': [], 'skipped_ads': []}
            for ad in group.get('ads') or []:
                ad_result = maybe_create_ad(group, adset_id, ad)
                if ad_result:
                    group_created['ads'].append({'ad_code': ad.get('ad_code'), 'result': ad_result})
                else:
                    group_created['skipped_ads'].append({'ad_code': ad.get('ad_code'), 'reason': 'ยังไม่มี Meta media id ใน feed_payload: ต้องมี image_hash หรือ video_id หรือ object_story_id'})
            created.append(group_created)
        except Exception as e:
            errors.append({'group': group.get('campaign_name'), 'error': str(e)})
    status = 'created_paused' if created and not errors else ('partial' if created else 'rejected')
    if not EXECUTE:
        status = 'dry_run'
    detail = {'execute': EXECUTE, 'created': created, 'errors': errors, 'note': 'All real Graph API writes are PAUSED only. Browser never receives Meta token.'}
    sb('POST', '/results', {'batch_id': approval['batch_id'], 'approval_id': approval['id'], 'status': status, 'detail': detail, 'audit_ref': f'approval-{approval["id"]}-{int(time.time())}'}, 'return=representation')
    if EXECUTE:
        sb('PATCH', f'/batches?id=eq.{enc(approval["batch_id"])}', {'status': 'done' if status == 'created_paused' else 'failed'}, 'return=minimal')
    print(json.dumps({'approval_id': approval['id'], 'status': status, 'created_groups': len(created), 'errors': errors}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
