#!/usr/bin/env python3
"""Production readiness check for ATTOP99 Creator Ads UI.

Does not print secrets. Exits 0 only when the app is ready for real Graph API
execution. Without META_ACCESS_TOKEN it exits 1 and marks Graph execution as
blocked, while Web UI/upload/mapping can still be ready.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def read_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def check(name: str, ok: bool, note: str = '') -> bool:
    icon = '✅' if ok else '❌'
    print(f'{icon} {name}' + (f' — {note}' if note else ''))
    return ok


def sb_get(url: str, key: str, path: str) -> Any:
    req = urllib.request.Request(
        url.rstrip('/') + '/rest/v1' + path,
        headers={'apikey': key, 'Authorization': f'Bearer {key}'},
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        txt = resp.read().decode('utf-8')
        return json.loads(txt) if txt else None


def main() -> int:
    local = read_env(ROOT / '.env.local')
    engine = read_env(ROOT / '.env.engine')
    public_url = local.get('NEXT_PUBLIC_SUPABASE_URL')
    anon = local.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    service = engine.get('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    meta = engine.get('META_ACCESS_TOKEN') or engine.get('ACCESS_TOKEN') or os.getenv('META_ACCESS_TOKEN') or os.getenv('ACCESS_TOKEN')
    meta_ver = engine.get('META_API_VERSION') or os.getenv('META_API_VERSION')

    print('ATT0P99 Creator Ads — Production Readiness')
    print('Secrets are never printed.\n')
    ok_all = True
    ok_all &= check('.env.local exists', (ROOT / '.env.local').exists())
    ok_all &= check('Supabase URL present', bool(public_url) and '<<' not in public_url)
    ok_all &= check('Supabase anon key present', bool(anon) and '<<' not in anon)
    ok_all &= check('No service role leaked in .env.local', 'service_role' not in '\n'.join(local.values()).lower())
    ok_all &= check('.env.engine exists', (ROOT / '.env.engine').exists())
    ok_all &= check('Supabase service role present server-side', bool(service) and 'replace-with' not in service)
    ok_all &= check('Meta API version present', bool(meta_ver), meta_ver or 'missing')

    schema_ok = False
    if public_url and service:
        try:
            rows = sb_get(public_url, service, '/accounts?select=account_label,brand,product,act_id,page_ids,pixel_id&limit=1')
            schema_ok = isinstance(rows, list)
        except Exception as e:
            print(f'❌ Supabase accounts schema check failed — {e}')
        else:
            check('Supabase accounts brand/product schema', schema_ok)
        try:
            rows = sb_get(public_url, service, '/creatives?select=ad_code,source_agent,external_ref,feed_payload&limit=1')
            feed_ok = isinstance(rows, list)
            ok_all &= check('Creative feed agent metadata schema', feed_ok)
        except Exception as e:
            ok_all = False
            print(f'❌ Creative feed schema check failed — {e}')
    else:
        ok_all = False
        print('❌ Supabase schema checks skipped — missing URL/service role')

    py = subprocess.run(['python3', '-m', 'py_compile', 'scripts/engine_map_batch.py', 'scripts/engine_process_approval.py', 'scripts/engine_worker.py'], cwd=ROOT, text=True, capture_output=True)
    ok_all &= check('Python engine scripts compile', py.returncode == 0, py.stderr.strip()[:200])

    build = subprocess.run(['npm', 'run', 'build'], cwd=ROOT, text=True, capture_output=True)
    ok_all &= check('Next.js production build', build.returncode == 0)
    if build.returncode != 0:
        print(build.stdout[-1200:])
        print(build.stderr[-1200:])

    graph_ready = bool(meta) and 'replace-with' not in meta
    check('Meta token present for real Graph API execute', graph_ready, 'required for npm run engine:worker -- --execute')

    print('\nResult:')
    if ok_all and graph_ready:
        print('✅ READY FOR PRODUCTION EXECUTE: upload → map → approve → Meta Graph API PAUSED creation')
        return 0
    if ok_all and not graph_ready:
        print('⚠️ WEB UI + MAPPING READY, but REAL GRAPH API is BLOCKED until META_ACCESS_TOKEN is set server-side')
        return 1
    print('❌ NOT READY — fix failed checks above')
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
