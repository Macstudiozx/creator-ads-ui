-- ATTOP99 Creator Ads UI production migration
-- Adds account product mapping and agent creative-feed metadata.
-- Run in Supabase SQL Editor. Safe to rerun.

-- 1) accounts: keep brand and add product as separate fields.
alter table public.accounts
  add column if not exists product text;

update public.accounts
set product = coalesce(product, brand)
where product is null;

create index if not exists accounts_product_idx on public.accounts(product);

-- 2) creatives: support automatic feed rows inserted by another agent/backend.
alter table public.creatives
  add column if not exists source_agent text,
  add column if not exists external_ref text,
  add column if not exists feed_payload jsonb not null default '{}'::jsonb,
  add column if not exists ingested_at timestamptz not null default now();

create index if not exists creatives_source_agent_idx on public.creatives(source_agent);
create index if not exists creatives_external_ref_idx on public.creatives(external_ref);
create index if not exists creatives_ingested_at_idx on public.creatives(ingested_at desc);

-- Optional idempotency for agent feeds when external_ref is provided.
create unique index if not exists creatives_source_external_ref_uniq
on public.creatives(source_agent, external_ref)
where source_agent is not null and external_ref is not null;

-- 3) Upsert real account product values.
insert into public.accounts (
  brand,
  product,
  account_label,
  act_id,
  page_ids,
  default_page_id,
  pixel_id,
  owner,
  active
)
values
  ('DRJADE', 'DRJADE', 'DR.JADE', '26998284149780179', array['1109300358937997'], '1109300358937997', '2287994378265905', 'ATT0P99', true),
  ('HMO', 'HMO', 'HAPPY Life', '603593437444446', array['246993791830119'], '246993791830119', '2287994378265905', 'Mac', true),
  ('HMO', 'HMO', 'อายุยืน', '1550298176199324', array['562856163570302'], '562856163570302', null, 'Mac', true),
  ('ASTA', 'ASTA', 'KENG ASTA', '828326256875829', array['561045733764039'], '561045733764039', null, 'Keng', true),
  ('ASTA', 'ASTA', 'สุขภาพดี', '828326256875829', array['561045733764039'], '561045733764039', null, 'Mik', true),
  ('OMG', 'OMG', 'MIK OMG', '1415468563577423', array['617344948123314'], '617344948123314', null, 'Mik', true),
  ('OMG', 'OMG', 'คุยเฟื่อง', '1415468563577423', array['617344948123314'], '617344948123314', null, 'Mik', true)
on conflict (account_label) do update
set
  brand = excluded.brand,
  product = excluded.product,
  act_id = excluded.act_id,
  page_ids = excluded.page_ids,
  default_page_id = excluded.default_page_id,
  pixel_id = excluded.pixel_id,
  owner = excluded.owner,
  active = excluded.active,
  updated_at = now();

-- 4) Verify.
select
  account_label,
  brand,
  product,
  act_id,
  default_page_id,
  pixel_id,
  active
from public.accounts
order by brand, account_label;
