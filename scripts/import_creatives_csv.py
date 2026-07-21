#!/usr/bin/env python3
"""Import real Creative Feed rows from CSV into Supabase creatives table.

CSV columns:
  ad_code,product,account_label,funnel,shorthand,angle,topic,format,version,
  caption,headline,brief_notes,media_source,drive_link,status,
  source_agent,external_ref,feed_payload

Usage:
  npm run import:creatives -- data/templates/creatives-import-template.csv
"""
from __future__ import annotations

import csv
import json
import os
import sys
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
    raise SystemExit('Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY')

csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data/templates/creatives-import-template.csv'
if not csv_path.is_absolute():
    csv_path = ROOT / csv_path
if not csv_path.exists():
    raise SystemExit(f'CSV not found: {csv_path}')

rows: list[dict[str, Any]] = []
required = ['ad_code','product','account_label','funnel','shorthand','angle','format','caption','headline']
with csv_path.open(newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    missing = [c for c in required if c not in (reader.fieldnames or [])]
    if missing:
        raise SystemExit(f'Missing columns: {missing}')
    for line_no, r in enumerate(reader, start=2):
        if not (r.get('ad_code') or '').strip():
            continue
        bad = [c for c in required if not (r.get(c) or '').strip()]
        if bad:
            raise SystemExit(f'Line {line_no}: missing required values {bad}')
        rows.append({
            'ad_code': r['ad_code'].strip().upper(),
            'product': r['product'].strip(),
            'account_label': r['account_label'].strip(),
            'funnel': r['funnel'].strip().upper(),
            'shorthand': r['shorthand'].strip(),
            'angle': r['angle'].strip(),
            'topic': (r.get('topic') or '').strip() or None,
            'format': r['format'].strip().upper(),
            'version': (r.get('version') or 'V01').strip(),
            'caption': r['caption'].strip(),
            'headline': r['headline'].strip(),
            'brief_notes': (r.get('brief_notes') or '').strip() or None,
            'media_source': (r.get('media_source') or '').strip() or None,
            'drive_link': (r.get('drive_link') or '').strip() or None,
            'status': (r.get('status') or 'briefed').strip(),
            'source_agent': (r.get('source_agent') or '').strip() or None,
            'external_ref': (r.get('external_ref') or '').strip() or None,
            'feed_payload': json.loads(r.get('feed_payload') or '{}'),
        })

if not rows:
    raise SystemExit('No rows to import')

req = urllib.request.Request(
    url.rstrip('/') + '/rest/v1/creatives?on_conflict=ad_code',
    data=json.dumps(rows, ensure_ascii=False).encode('utf-8'),
    headers={
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    method='POST',
)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f'Imported {len(data)} creative rows from {csv_path}')
        print(json.dumps([{'ad_code': x['ad_code'], 'account_label': x['account_label'], 'status': x['status']} for x in data], ensure_ascii=False, indent=2))
except urllib.error.HTTPError as e:
    raise SystemExit(f'Import failed HTTP {e.code}: {e.read().decode()}')
