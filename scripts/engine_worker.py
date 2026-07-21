#!/usr/bin/env python3
"""ATT0P99 engine worker.

Polls Supabase and runs:
1) engine_map_batch.py for pending uploads
2) engine_process_approval.py for approved proposals

Default approval processing is dry-run. Pass --execute to allow real Meta Graph API
writes. Even in execute mode, created objects are PAUSED only.

Usage:
  npm run engine:worker
  npm run engine:worker -- --execute
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXECUTE = '--execute' in sys.argv
INTERVAL = 8


def run(args: list[str]) -> int:
    print('$', ' '.join(args), flush=True)
    p = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    if p.stdout:
        print(p.stdout.strip(), flush=True)
    if p.stderr:
        print(p.stderr.strip(), flush=True)
    return p.returncode


print(f'ATT0P99 engine worker started execute={EXECUTE} interval={INTERVAL}s', flush=True)
while True:
    # No pending batch / approval is a normal state; scripts return non-zero with a clear message.
    run(['python3', 'scripts/engine_map_batch.py'])
    approve_args = ['python3', 'scripts/engine_process_approval.py']
    if EXECUTE:
        approve_args.append('--execute')
    run(approve_args)
    time.sleep(INTERVAL)
