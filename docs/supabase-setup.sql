-- Supabase setup for ATTOP99 Creator Ads UI
-- Run in Supabase Dashboard → SQL Editor → New query.
-- Uses anon/authenticated only for Web UI. Do NOT put service_role or Meta tokens in Web UI.

create extension if not exists pgcrypto;

-- Helper: role from JWT. Supports either top-level role per spec or app_metadata.role.
create or replace function public.jwt_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'role', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    'viewer'
  );
$$;

-- 1) accounts
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  brand           text not null,
  account_label   text not null unique,
  act_id          text not null,
  page_ids        text[] not null default '{}',
  default_page_id text,
  pixel_id        text,
  owner           text,
  active          boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- 2) shorthands
create table if not exists public.shorthands (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  funnel            text not null,
  objective         text not null,
  optimization_goal text not null,
  destination_type  text not null default 'MESSENGER',
  regen_slot        text not null,
  allowed_funnels   text[] not null default '{}',
  active            boolean not null default true
);

-- 3) creatives
create table if not exists public.creatives (
  id            uuid primary key default gen_random_uuid(),
  ad_code       text not null unique,
  product       text not null,
  account_label text not null references public.accounts(account_label),
  funnel        text not null,
  shorthand     text not null references public.shorthands(code),
  angle         text not null,
  topic         text,
  format        text not null,
  version       text not null default 'V01',
  caption       text not null,
  headline      text not null,
  brief_notes   text,
  media_path    text,
  media_source  text,
  drive_link    text,
  status        text not null default 'briefed',
  campaign_id   text,
  adset_id      text,
  ad_id         text,
  ads_status    text,
  created_at    timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists creatives_ad_code_idx on public.creatives(ad_code);
create index if not exists creatives_status_idx on public.creatives(status);

-- 4) batches
create table if not exists public.batches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  created_by  uuid not null references auth.users(id),
  brand       text,
  promo       text,
  brand_tone  text,
  status      text not null default 'pending_analysis',
  created_at  timestamptz not null default now()
);

-- 5) batch_items
create table if not exists public.batch_items (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.batches(id) on delete cascade,
  creative_id  uuid references public.creatives(id),
  ad_code_input text,
  media_path   text not null,
  match_status text not null default 'matched'
);

-- 6) proposals -- engine writes, UI reads
create table if not exists public.proposals (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches(id),
  version     int not null default 1,
  plan        jsonb not null,
  summary     jsonb not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists proposals_batch_version_idx on public.proposals(batch_id, version desc);

-- 7) approvals -- UI/Hermes insert, engine consumes
create table if not exists public.approvals (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.batches(id),
  proposal_version  int not null,
  approved_by       uuid not null references auth.users(id),
  channel           text not null,
  mode              text not null default 'create_paused',
  overrides         jsonb,
  hold_resolutions  jsonb,
  created_at        timestamptz not null default now()
);

-- 8) results -- engine writes, UI reads
create table if not exists public.results (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches(id),
  approval_id uuid references public.approvals(id),
  status      text not null,
  detail      jsonb not null,
  audit_ref   text,
  created_at  timestamptz not null default now()
);
create index if not exists results_batch_idx on public.results(batch_id);

-- 9) progress_events -- engine writes, UI reads + Realtime subscribes
create table if not exists public.progress_events (
  id        bigint generated always as identity primary key,
  batch_id  uuid not null references public.batches(id),
  seq       int not null,
  event     text not null,
  payload   jsonb not null,
  ts        timestamptz not null default now()
);
create index if not exists progress_events_batch_seq_idx on public.progress_events(batch_id, seq);

-- 10) audit_log
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid references auth.users(id),
  table_name  text not null,
  row_id      uuid,
  action      text not null,
  old_value   jsonb,
  new_value   jsonb,
  ts          timestamptz not null default now()
);

-- Realtime publication for scanning theater
alter publication supabase_realtime add table public.progress_events;

-- RLS
alter table public.accounts enable row level security;
alter table public.shorthands enable row level security;
alter table public.creatives enable row level security;
alter table public.batches enable row level security;
alter table public.batch_items enable row level security;
alter table public.proposals enable row level security;
alter table public.approvals enable row level security;
alter table public.results enable row level security;
alter table public.progress_events enable row level security;
alter table public.audit_log enable row level security;

-- Read policies: all authenticated users can read UI tables.
do $$ begin
  create policy accounts_read_all on public.accounts for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy shorthands_read_all on public.shorthands for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy creatives_read_all on public.creatives for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy batches_read_all on public.batches for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy batch_items_read_all on public.batch_items for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy proposals_read_all on public.proposals for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy approvals_read_all on public.approvals for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy results_read_all on public.results for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy progress_events_read_all on public.progress_events for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy audit_log_read_all on public.audit_log for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Upload flow: creator inserts own batch and items.
do $$ begin
  create policy batches_insert_own on public.batches for insert to authenticated
  with check (created_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy batch_items_insert_own_batch on public.batch_items for insert to authenticated
  with check (exists (select 1 from public.batches b where b.id = batch_id and b.created_by = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy batch_items_update_own_batch on public.batch_items for update to authenticated
  using (exists (select 1 from public.batches b where b.id = batch_id and b.created_by = auth.uid()))
  with check (exists (select 1 from public.batches b where b.id = batch_id and b.created_by = auth.uid()));
exception when duplicate_object then null; end $$;

-- Approvals: approver/admin only and approved_by must be self.
do $$ begin
  create policy approvals_insert_approver on public.approvals for insert to authenticated
  with check (
    approved_by = auth.uid()
    and public.jwt_app_role() in ('approver','admin')
  );
exception when duplicate_object then null; end $$;

-- Admin config writes.
do $$ begin
  create policy accounts_admin_write on public.accounts for all to authenticated
  using (public.jwt_app_role() = 'admin')
  with check (public.jwt_app_role() = 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy shorthands_admin_write on public.shorthands for all to authenticated
  using (public.jwt_app_role() = 'admin')
  with check (public.jwt_app_role() = 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy audit_log_admin_insert on public.audit_log for insert to authenticated
  with check (actor = auth.uid() and public.jwt_app_role() = 'admin');
exception when duplicate_object then null; end $$;

-- No authenticated INSERT policies for proposals/results/progress_events/creatives.
-- Engine should use server-side service_role outside Web UI.

-- Storage bucket for creative upload
insert into storage.buckets (id, name, public)
values ('creative-media', 'creative-media', false)
on conflict (id) do update set public = false;

-- Storage policies for authenticated direct signed uploads.
do $$ begin
  create policy creative_media_read on storage.objects for select to authenticated
  using (bucket_id = 'creative-media');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy creative_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'creative-media');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy creative_media_update on storage.objects for update to authenticated
  using (bucket_id = 'creative-media')
  with check (bucket_id = 'creative-media');
exception when duplicate_object then null; end $$;

-- Seed config for dev/test. Replace with real ATTOP99 mappings later.
insert into public.accounts (brand, account_label, act_id, page_ids, default_page_id, pixel_id, owner, active) values
  ('HMO', 'HAPPY Life', '603593437444446', array['246993791830119'], '246993791830119', null, 'Mac', true),
  ('HMO', 'อายุยืน', '1550298176199324', array['562856163570302'], '562856163570302', null, 'Mac', true),
  ('ASTA', 'สุขภาพดี', '828326256875829', array['561045733764039'], '561045733764039', null, 'Mik', true),
  ('OMG', 'คุยเฟื่อง', '1415468563577423', array['617344948123314'], '617344948123314', null, 'Mik', true)
on conflict (account_label) do update set
  brand = excluded.brand,
  act_id = excluded.act_id,
  page_ids = excluded.page_ids,
  default_page_id = excluded.default_page_id,
  owner = excluded.owner,
  active = excluded.active,
  updated_at = now();

insert into public.shorthands (code, funnel, objective, optimization_goal, destination_type, regen_slot, allowed_funnels, active) values
  ('ENG-LEAD', 'TOF', 'OUTCOME_ENGAGEMENT', 'LEAD_GENERATION', 'MESSENGER', 'tof_eng_lead', array['TOF'], true),
  ('ENG-CHAT', 'MOF', 'OUTCOME_ENGAGEMENT', 'CONVERSATIONS', 'MESSENGER', 'mof_eng_chat', array['MOF','BOF'], true),
  ('Sales-PTM', 'BOF', 'OUTCOME_SALES', 'MESSAGING_PURCHASE_CONVERSION', 'MESSENGER', 'bof_sales_ptm', array['BOF'], true)
on conflict (code) do update set
  funnel = excluded.funnel,
  objective = excluded.objective,
  optimization_goal = excluded.optimization_goal,
  destination_type = excluded.destination_type,
  regen_slot = excluded.regen_slot,
  allowed_funnels = excluded.allowed_funnels,
  active = excluded.active;

insert into public.creatives (ad_code, product, account_label, funnel, shorthand, angle, topic, format, version, caption, headline, status, ads_status) values
  ('AD000133', 'HMO', 'HAPPY Life', 'TOF', 'ENG-LEAD', 'Acquire', 'PainPoint', 'VDO', 'V01', 'เข่าลั่นทุกครั้งที่ลุก?', 'อ่านก่อนสาย', 'briefed', null),
  ('AD000141', 'HMO', 'HAPPY Life', 'MOF', 'ENG-CHAT', 'Educate', 'Review', 'VDO', 'V01', 'รีวิวจริงจากคุณแม่', 'ฟังจากปากจริง', 'proposed', null),
  ('AD000147', 'HMO', 'HAPPY Life', 'BOF', 'Sales-PTM', 'Promotion', 'Bundle', 'VDO', 'V01', 'โปร 7.7 มาแล้ว', 'รับสิทธิ์ก่อนหมด', 'paused', 'PAUSED'),
  ('AD000114', 'HMO', 'HAPPY Life', 'BOF', 'Sales-PTM', 'Promotion', 'Promo', 'VDO', 'V03', 'โปรแรงวันนี้', 'ทักแชท', 'live', 'ACTIVE')
on conflict (ad_code) do update set
  product = excluded.product,
  account_label = excluded.account_label,
  funnel = excluded.funnel,
  shorthand = excluded.shorthand,
  angle = excluded.angle,
  topic = excluded.topic,
  format = excluded.format,
  version = excluded.version,
  caption = excluded.caption,
  headline = excluded.headline,
  status = excluded.status,
  ads_status = excluded.ads_status,
  updated_at = now();
