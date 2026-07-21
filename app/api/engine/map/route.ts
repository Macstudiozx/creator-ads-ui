import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdirSync, openSync, closeSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

type Body = { batch_id?: string };

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const batchId = String(body.batch_id || '').trim();
  if (!batchId) {
    return NextResponse.json({ ok: false, error: 'batch_id is required' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) {
    return NextResponse.json({ ok: false, error: 'invalid batch_id format' }, { status: 400 });
  }

  const root = process.cwd();
  const logDir = path.join(root, 'output', 'engine-runs');
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `map-${batchId}-${Date.now()}.log`);
  const out = openSync(logPath, 'a');

  const child = spawn('python3', ['scripts/engine_map_batch.py', batchId], {
    cwd: root,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  child.unref();
  closeSync(out);

  return NextResponse.json({ ok: true, batch_id: batchId, pid: child.pid, log: logPath });
}
