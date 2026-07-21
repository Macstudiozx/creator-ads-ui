import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

type Env = Record<string, string>;

type SafetyConfig = {
  creator_auto_disabled: boolean;
  daily_budget_cap_thb: number;
  min_ads_per_funnel: number;
  require_paused_first: boolean;
  activation_requires_approval: boolean;
};

const DEFAULT_SAFETY: SafetyConfig = {
  creator_auto_disabled: false,
  daily_budget_cap_thb: 2000,
  min_ads_per_funnel: 2,
  require_paused_first: true,
  activation_requires_approval: true,
};

function readEnvFile(file: string): Env {
  const out: Env = {};
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
    ...process.env,
    ...readEnvFile(path.join(root, '.env.local')),
    ...readEnvFile(path.join(root, '.env.engine')),
  };
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function sbFetch(restPath: string, init: RequestInit = {}) {
  const { supabaseUrl, serviceKey } = serverEnv();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase server env');
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1${restPath}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return data;
}

const clean = (v: any) => String(v ?? '').trim();
const nullable = (v: any) => {
  const s = clean(v);
  return s ? s : null;
};
const csv = (v: any) => Array.isArray(v) ? v.map(clean).filter(Boolean) : clean(v).split(',').map((x) => x.trim()).filter(Boolean);
const bool = (v: any, fallback = true) => typeof v === 'boolean' ? v : fallback;
const num = (v: any, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function accountPayload(row: any) {
  const pageIds = csv(row.page_ids);
  return {
    brand: clean(row.brand),
    product: clean(row.product || row.brand),
    account_label: clean(row.account_label),
    act_id: clean(row.act_id).replace(/^act_/, ''),
    page_ids: pageIds,
    default_page_id: nullable(row.default_page_id) || pageIds[0] || null,
    pixel_id: nullable(row.pixel_id),
    owner: nullable(row.owner) || 'Mac',
    active: bool(row.active, true),
  };
}

function shorthandPayload(row: any) {
  return {
    code: clean(row.code),
    funnel: clean(row.funnel).toUpperCase(),
    objective: clean(row.objective),
    optimization_goal: clean(row.optimization_goal),
    destination_type: clean(row.destination_type || 'MESSENGER'),
    regen_slot: clean(row.regen_slot),
    allowed_funnels: csv(row.allowed_funnels).map((x) => x.toUpperCase()),
    active: bool(row.active, true),
  };
}

function health(accounts: any[], shorthands: any[]) {
  const missingPixels = accounts.filter((a) => !a.pixel_id);
  const drift = accounts.filter((a) => (a.page_ids?.length || 0) > 1 || (a.page_ids?.length && a.default_page_id && !a.page_ids.includes(a.default_page_id)));
  const regenWarnings = shorthands.filter((s) => !s.regen_slot || !(s.allowed_funnels || []).includes(s.funnel));
  return {
    missingPixels: missingPixels.length,
    drift: drift.length,
    regenWarnings: regenWarnings.length,
    totalIssues: missingPixels.length + drift.length + regenWarnings.length,
    checkedAt: new Date().toISOString(),
  };
}

async function latestSafetyConfig() {
  const rows = await sbFetch('/audit_log?table_name=eq.system_flags&action=eq.settings_config&select=id,new_value,ts&order=ts.desc&limit=1');
  const latest = rows?.[0]?.new_value || {};
  const killRows = await sbFetch('/audit_log?table_name=eq.system_flags&action=eq.kill_switch&select=id,new_value,ts&order=ts.desc&limit=1');
  const kill = killRows?.[0]?.new_value?.creator_auto_disabled;
  return {
    ...DEFAULT_SAFETY,
    ...latest,
    creator_auto_disabled: typeof kill === 'boolean' ? kill : (latest.creator_auto_disabled ?? DEFAULT_SAFETY.creator_auto_disabled),
    _audit_id: rows?.[0]?.id || null,
    _kill_audit_id: killRows?.[0]?.id || null,
  };
}

export async function GET() {
  try {
    const [accounts, shorthands, safety] = await Promise.all([
      sbFetch('/accounts?select=*&order=account_label.asc'),
      sbFetch('/shorthands?select=*&order=code.asc'),
      latestSafetyConfig(),
    ]);
    return NextResponse.json({ ok: true, accounts, shorthands, safety, health: health(accounts || [], shorthands || []) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'add_account' || action === 'update_account') {
      const payload = accountPayload(body.account || {});
      for (const k of ['brand', 'product', 'account_label', 'act_id']) {
        if (!String((payload as any)[k] || '').trim()) return NextResponse.json({ ok: false, error: `${k} is required` }, { status: 400 });
      }
      if (action === 'update_account') {
        const id = clean(body.id || body.account?.id);
        if (!id) return NextResponse.json({ ok: false, error: 'account id is required' }, { status: 400 });
        const data = await sbFetch(`/accounts?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }) });
        return NextResponse.json({ ok: true, account: data?.[0] || payload });
      }
      const data = await sbFetch('/accounts', { method: 'POST', body: JSON.stringify(payload) });
      return NextResponse.json({ ok: true, account: data?.[0] || payload });
    }

    if (action === 'set_account_active') {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ ok: false, error: 'account id is required' }, { status: 400 });
      const data = await sbFetch(`/accounts?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active: !!body.active, updated_at: new Date().toISOString() }) });
      return NextResponse.json({ ok: true, account: data?.[0] || null });
    }

    if (action === 'hard_delete_account') {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ ok: false, error: 'account id is required' }, { status: 400 });
      await sbFetch(`/accounts?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_shorthand' || action === 'update_shorthand') {
      const payload = shorthandPayload(body.shorthand || {});
      for (const k of ['code', 'funnel', 'objective', 'optimization_goal', 'regen_slot']) {
        if (!String((payload as any)[k] || '').trim()) return NextResponse.json({ ok: false, error: `${k} is required` }, { status: 400 });
      }
      if (action === 'update_shorthand') {
        const id = clean(body.id || body.shorthand?.id);
        if (!id) return NextResponse.json({ ok: false, error: 'shorthand id is required' }, { status: 400 });
        const data = await sbFetch(`/shorthands?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        return NextResponse.json({ ok: true, shorthand: data?.[0] || payload });
      }
      const data = await sbFetch('/shorthands', { method: 'POST', body: JSON.stringify(payload) });
      return NextResponse.json({ ok: true, shorthand: data?.[0] || payload });
    }

    if (action === 'set_shorthand_active') {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ ok: false, error: 'shorthand id is required' }, { status: 400 });
      const data = await sbFetch(`/shorthands?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active: !!body.active }) });
      return NextResponse.json({ ok: true, shorthand: data?.[0] || null });
    }

    if (action === 'hard_delete_shorthand') {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ ok: false, error: 'shorthand id is required' }, { status: 400 });
      await sbFetch(`/shorthands?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return NextResponse.json({ ok: true });
    }

    if (action === 'save_safety') {
      const raw = body.safety || {};
      const safety: SafetyConfig = {
        creator_auto_disabled: !!raw.creator_auto_disabled,
        daily_budget_cap_thb: num(raw.daily_budget_cap_thb, DEFAULT_SAFETY.daily_budget_cap_thb),
        min_ads_per_funnel: num(raw.min_ads_per_funnel, DEFAULT_SAFETY.min_ads_per_funnel),
        require_paused_first: raw.require_paused_first !== false,
        activation_requires_approval: raw.activation_requires_approval !== false,
      };
      const audit = await sbFetch('/audit_log', {
        method: 'POST',
        body: JSON.stringify({ table_name: 'system_flags', action: 'settings_config', new_value: { ...safety, source: 'settings_ui_server' } }),
      });
      if (typeof raw.creator_auto_disabled === 'boolean') {
        await sbFetch('/audit_log', {
          method: 'POST',
          body: JSON.stringify({ table_name: 'system_flags', action: 'kill_switch', new_value: { creator_auto_disabled: safety.creator_auto_disabled, source: 'settings_ui_server' } }),
        });
      }
      return NextResponse.json({ ok: true, safety, audit: audit?.[0] || null });
    }

    if (action === 'kill_switch') {
      const next = !!body.enabled;
      const audit = await sbFetch('/audit_log', {
        method: 'POST',
        body: JSON.stringify({ table_name: 'system_flags', action: 'kill_switch', new_value: { creator_auto_disabled: next, source: 'settings_ui_server' } }),
      });
      return NextResponse.json({ ok: true, killSwitch: next, audit: audit?.[0] || null });
    }

    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
