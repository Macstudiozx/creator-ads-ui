import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createClient as createSupabaseServerClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

type Body = { batch_id?: string; proposal_version?: number; overrides?: any; force?: boolean };

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    out[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function serverEnv() {
  const root = process.cwd();
  const env = {
    ...process.env,
    ...readEnvFile(path.join(root, '.env.local')),
    ...readEnvFile(path.join(root, '.env.engine')),
  };
  return {
    root,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    metaToken: env.META_ACCESS_TOKEN || env.ACCESS_TOKEN,
  };
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const batchId = String(body.batch_id || '').trim();
  const proposalVersion = Number(body.proposal_version || 1);
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) {
    return NextResponse.json({ ok: false, error: 'invalid batch_id format' }, { status: 400 });
  }

  const { root, supabaseUrl, serviceKey, metaToken } = serverEnv();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'Missing Supabase server env' }, { status: 500 });
  }
  if (!metaToken) {
    return NextResponse.json({ ok: false, error: 'Missing META_ACCESS_TOKEN/ACCESS_TOKEN. Refusing live create.' }, { status: 500 });
  }

  const supabase = createSupabaseServerClient(supabaseUrl, serviceKey);

  const { data: killRows, error: killErr } = await supabase
    .from('audit_log')
    .select('id,new_value,ts')
    .eq('table_name', 'system_flags')
    .eq('action', 'kill_switch')
    .order('ts', { ascending: false })
    .limit(1);
  if (killErr) return NextResponse.json({ ok: false, error: killErr.message }, { status: 500 });
  if (killRows?.[0]?.new_value?.creator_auto_disabled === true && !body.force) {
    return NextResponse.json({
      ok: false,
      error: 'Kill-switch เปิดอยู่ ระบบจึงไม่สร้าง Meta objects จนกว่าจะปิดทางด่วนหรือส่ง force โดยผู้ดูแล',
      kill_switch: killRows[0],
    }, { status: 423 });
  }

  const { data: existingResults, error: resultErr } = await supabase
    .from('results')
    .select('id,status,detail,created_at')
    .eq('batch_id', batchId)
    .limit(5);
  if (resultErr) return NextResponse.json({ ok: false, error: resultErr.message }, { status: 500 });
  const successfulResults = (existingResults || []).filter((r: any) => r.status === 'created_paused');
  if (!body.force && successfulResults.length > 0) {
    return NextResponse.json({
      ok: false,
      error: 'Batch นี้เคยสร้างสำเร็จแล้ว เพื่อกันสร้างซ้ำระบบจึงหยุดไว้ก่อน',
      existing_results: successfulResults,
    }, { status: 409 });
  }

  const { data: proposal, error: proposalErr } = await supabase
    .from('proposals')
    .select('id,batch_id,version,summary,plan')
    .eq('batch_id', batchId)
    .eq('version', proposalVersion)
    .single();
  if (proposalErr || !proposal) {
    return NextResponse.json({ ok: false, error: proposalErr?.message || 'Proposal not found' }, { status: 404 });
  }

  const { data: listedUsers, error: usersErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (usersErr) return NextResponse.json({ ok: false, error: usersErr.message }, { status: 500 });
  const approvedBy = listedUsers?.users?.[0]?.id;
  if (!approvedBy) {
    return NextResponse.json({ ok: false, error: 'No auth.users row found for approved_by' }, { status: 500 });
  }

  const { data: approvalRows, error: approvalErr } = await supabase
    .from('approvals')
    .insert({
      batch_id: batchId,
      proposal_version: proposalVersion,
      approved_by: approvedBy,
      channel: 'webui-server',
      mode: 'create_paused',
      overrides: body.overrides || { source: 'ui-live-create-button' },
    })
    .select('*')
    .single();
  if (approvalErr) return NextResponse.json({ ok: false, error: approvalErr.message }, { status: 500 });

  try {
    const { stdout, stderr } = await execFileAsync('python3', ['scripts/engine_process_approval.py', '--execute'], {
      cwd: root,
      timeout: 180000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        META_ACCESS_TOKEN: metaToken,
      },
    });
    const { data: results } = await supabase
      .from('results')
      .select('*')
      .eq('approval_id', approvalRows.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const result = results?.[0] || null;
    if (!result || result.status !== 'created_paused') {
      return NextResponse.json({
        ok: false,
        approval: approvalRows,
        result,
        error: result?.detail?.errors?.[0]?.error || 'Engine did not create Meta objects',
        stdout,
        stderr,
      }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      approval: approvalRows,
      result,
      stdout,
      stderr,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      approval: approvalRows,
      error: err?.message || String(err),
      stdout: err?.stdout,
      stderr: err?.stderr,
    }, { status: 500 });
  }
}
