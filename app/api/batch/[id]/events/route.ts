import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createClient as createSupabaseServerClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    out[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function serverEnv() {
  const root = process.cwd();
  const env = {
    ...readEnvFile(path.join(root, '.env.local')),
    ...readEnvFile(path.join(root, '.env.engine')),
    ...process.env,
  };
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function sbGet(restPath: string) {
  const { supabaseUrl, serviceKey } = serverEnv();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase server env');
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1${restPath}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'invalid batch id' }, { status: 400 });
  }
  const batchId = encodeURIComponent(id);
  const { supabaseUrl, serviceKey } = serverEnv();
  try {
    const [batch, events, proposals, results] = await Promise.all([
      sbGet(`/batches?id=eq.${batchId}&select=id,code,status&limit=1`),
      sbGet(`/progress_events?batch_id=eq.${batchId}&select=seq,event,payload&order=seq.asc`),
      sbGet(`/proposals?batch_id=eq.${batchId}&select=*&order=version.desc&limit=1`),
      sbGet(`/results?batch_id=eq.${batchId}&select=*&order=created_at.desc&limit=1`),
    ]);
    const proposal = proposals?.[0] || null;
    const mediaUrls: Record<string, string> = {};
    if (proposal && supabaseUrl && serviceKey) {
      const ads = (proposal.plan?.groups || []).flatMap((g:any) => g.ads || []);
      const paths = [...new Set(ads.map((ad:any) => ad.media_path).filter(Boolean))] as string[];
      const supabase = createSupabaseServerClient(supabaseUrl, serviceKey);
      await Promise.all(paths.map(async (p) => {
        const { data } = await supabase.storage.from('creative-media').createSignedUrl(p, 60 * 60);
        if (data?.signedUrl) mediaUrls[p] = data.signedUrl;
      }));
    }
    return NextResponse.json({ ok: true, batch: batch?.[0] || null, events, proposal, result: results?.[0] || null, mediaUrls });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
