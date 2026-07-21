# Integration Spec (Supabase) — Creator Console ↔ Engine ↔ Hermes

> เวอร์ชัน 2.0 · 2026-07-16 · **แทนที่** integration-spec (แบบไฟล์ exchange/) ทั้งฉบับ
> เปลี่ยนศูนย์กลางจาก "ไฟล์ JSON ในโฟลเดอร์" เป็น **Supabase (Postgres + Realtime + Storage + Auth + RLS)**
> ใช้คู่กับ: architecture-sop · SETUP.md · regen repo (ระบบดูแลผล — ไม่เปลี่ยน)

---

## §1 หลักการ (คงเดิม + เพิ่มของ Supabase)

```text
1. Engine (Python) คือสมอง — mapping / ตั้งชื่อ / ด่าน 5 ข้อ / บัญชีดำ / Graph API อยู่ในโค้ด
   ไม่ใช่ในพรอมป์ → กฎเป็น "กำแพง" ทดสอบด้วย unit test ไม่ใช่ลองหลอก LLM

2. Engine เป็นมือเดียวที่แตะ Meta API และถือ META_ACCESS_TOKEN
   Web UI / Hermes / Supabase ห้ามยิง Graph API เด็ดขาด

3. Supabase คือศูนย์กลางข้อมูลเดียว (ไม่มีไฟล์ exchange/ อีกต่อไป)
   ใครเขียนอะไรได้ = บังคับด้วย RLS ที่ระดับฐานข้อมูล ละเมิดไม่ได้

4. regen ยังเป็นเจ้าของ "เกณฑ์ KPI + funnel slots + blueprint" (ความจริงที่แชร์กับ optimizer)
   Supabase ถือได้แค่ mapping ของ Creator เอง (บัญชี/คำย่อ) และต้อง cross-check กับ regen ก่อนใช้

5. การกดปุ่มบน UI / สั่งผ่านแชท = การเขียนแถวในตาราง ไม่ใช่การสั่ง Meta โดยตรง
   engine เป็นผู้อ่านแถว ตรวจ แล้วลงมือ — ตกเงื่อนไขไหน engine ปฏิเสธได้

6. ทั้ง Web UI และแชท Hermes = สองประตูของ approval ระบบเดียวกัน
   เขียนเข้าตารางเดียวกัน · engine ตรวจด้วยด่านเดียวกัน · audit ที่เดียวกัน
```

---

## §2 สถาปัตยกรรม

```text
  Agent บรีฟ ──insert──►┌───────────────────────────────┐
                        │           SUPABASE            │
  ผู้ใช้ ─upload─►Storage │  ตารางข้อมูล + RLS + Realtime  │◄─write back ad_id── ENGINE (Python)
                        │                               │                     │  · supabase-py
  Web UI ─approve─insert►│  creatives · batches          │──Realtime push──►    │  · ถือ token
                        │  proposals · approvals        │   Scanning Theater  │  · ยิง Graph API
  Hermes ─แชท→insert────►│  results · progress_events    │   + สถานะการ์ด       │  · cross-check regen
                        │  accounts · shorthands (cfg)  │                     │
                        │  audit_log                    │◄─read-only─ regen ──┘  (เกณฑ์ KPI/blueprint)
                        └───────────────────────────────┘
```

**บทบาท:**
| ใคร | หน้าที่ | แตะ Meta? | แตะ Supabase |
|---|---|---|---|
| **Engine** | ทุกอย่างที่แตะเงิน+กฎ · ยิงจริง · เขียนผลกลับ | ✅ มือเดียว | service_role (เขียนทุกตาราง) |
| **Web UI** | อัปโหลดสื่อ · อนุมัติ · ดูสถานะ · ตรวจสุขภาพ | ❌ | anon+auth (RLS จำกัด) |
| **Hermes** | รัน cron · อ่าน results สรุปไทย · รับคำสั่งแชท · escalate | ❌ | service_role (insert batch/command) |
| **Agent บรีฟ** | เขียนแถว creatives (บรีฟสื่อ) | ❌ | service_role (เขียน creatives) |

---

## §3 ตารางฐานข้อมูล (DDL)

### 3.1 Config — mapping ของ Creator (แก้ผ่านระบบได้ แต่มี guard)

```sql
-- ตารางบัญชี (แทน Ad Account Map ใน Lark)
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  brand         text not null,               -- HMO, OMG, ASTA...
  account_label text not null unique,         -- "HAPPY Life", "อายุยืน"
  act_id        text not null,                -- Meta Ad Account (เลขล้วน)
  page_ids      text[] not null,              -- รองรับหลายเพจ
  default_page_id text,                        -- เพจ default ถ้ามีหลายอัน
  pixel_id      text,                          -- null ได้ (BOF บาง audience จะทำไม่ได้)
  owner         text,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- คำย่อ → objective/goal (แทนการ hardcode ในพรอมป์)
create table shorthands (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,      -- "ENG-LEAD"
  funnel            text not null,             -- TOF/MOF/BOF
  objective         text not null,             -- OUTCOME_ENGAGEMENT
  optimization_goal text not null,             -- LEAD_GENERATION
  destination_type  text not null default 'MESSENGER',
  regen_slot        text not null,             -- ชื่อ slot ใน regen ที่ต้อง match ได้ (guard)
  allowed_funnels   text[] not null,           -- funnel ที่ใช้คู่ได้ (กัน TOF+ENG-CHAT)
  active            boolean not null default true
);
```

> **guard สำคัญ:** ตอน engine โหลด `shorthands` มัน**ต้องเช็คว่า `regen_slot` มีอยู่จริงใน regen config** — ไม่มี = ปฏิเสธ (กันคำย่อที่ทำให้เกิดแอดกำพร้า)

### 3.2 Creative Feed — บรีฟจาก Agent (แทนตาราง Lark)

```sql
create table creatives (
  id            uuid primary key default gen_random_uuid(),
  ad_code       text not null unique,          -- AD710763 — key ที่ user ตั้งชื่อไฟล์ตาม
  -- จาก Agent บรีฟ:
  product       text not null,                 -- HMO, HMO+CDZ
  account_label text not null references accounts(account_label),
  funnel        text not null,                 -- TOF/MOF/BOF
  shorthand     text not null references shorthands(code),  -- ENG-LEAD
  angle         text not null,                 -- Acquire/Educate/Promotion/Sales/Test/KOL*
  topic         text,                          -- PainPoint, GutBalance (อังกฤษ! ห้าม "เปิด")
  format        text not null,                 -- VDO/IMG/CAROUSEL
  version       text not null default 'V01',
  caption       text not null,
  headline      text not null,
  brief_notes   text,                          -- Angle/Brief เดิม
  -- สื่อ:
  media_path    text,                          -- path ใน Storage (user อัปโหลด)
  media_source  text,                          -- 'upload' | 'drive_link'
  drive_link    text,
  -- สถานะ + เขียนกลับ:
  status        text not null default 'briefed',  -- briefed/uploaded/proposed/creating/paused/live/rejected
  campaign_id   text, adset_id text, ad_id text,
  ads_status    text,                          -- PAUSED/ACTIVE
  created_at    timestamptz,
  updated_at    timestamptz not null default now()
);
create index on creatives(ad_code);
create index on creatives(status);
```

### 3.3 Workflow — batch / proposal / approval / result (แทนไฟล์ exchange/)

```sql
create table batches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,            -- B-20260716-0932
  created_by  uuid not null references auth.users(id),
  brand       text, promo text, brand_tone text,
  status      text not null default 'pending_analysis',
  -- pending_analysis/analyzing/proposed/approved/creating/done/failed
  created_at  timestamptz not null default now()
);

create table batch_items (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references batches(id) on delete cascade,
  creative_id uuid references creatives(id),    -- null = ยังจับคู่รหัสไม่ได้
  ad_code_input text,                            -- รหัสจากชื่อไฟล์ที่ user อัปโหลด
  media_path  text not null,
  match_status text not null default 'matched'  -- matched/unmatched/manual
);

create table proposals (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references batches(id),
  version       int not null default 1,
  plan          jsonb not null,                 -- โครงกลุ่ม/audience/งบ/checks (ดู §7.3)
  summary       jsonb not null,                 -- {campaigns, adsets, ads_ready, budget, hold}
  expires_at    timestamptz not null,           -- +24 ชม.
  created_at    timestamptz not null default now()
);

create table approvals (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references batches(id),
  proposal_version  int not null,
  approved_by       uuid not null references auth.users(id),  -- จาก auth.uid() เท่านั้น
  channel           text not null,              -- 'webui' | 'hermes_chat'
  mode              text not null default 'create_paused',
  overrides         jsonb,                      -- budgets/captions ที่คนแก้
  hold_resolutions  jsonb,                      -- ชี้ขาด conflict
  created_at        timestamptz not null default now()
);

create table results (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references batches(id),
  approval_id uuid references approvals(id),
  status      text not null,                    -- created_paused/partial/rejected
  detail      jsonb not null,                   -- created[] / errors[] / audiences_created[]
  audit_ref   text,                             -- ชื่อ log file ฝั่ง engine
  created_at  timestamptz not null default now()
);
```

### 3.4 Realtime feed + Audit

```sql
-- ทุก event ของการวิเคราะห์ → Realtime push ขับ Scanning Theater
create table progress_events (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references batches(id),
  seq         int not null,
  event       text not null,      -- batch_started/file_started/classified/conflict/
                                   -- needs_input/audience_resolved/budget_set/
                                   -- caption_ready/fda_check/batch_done/batch_failed
  payload     jsonb not null,     -- {file, funnel, confidence, source, signals, ...}
  ts          timestamptz not null default now()
);

-- ทุกการแก้ config (accounts/shorthands) — ใครแก้อะไรเมื่อไหร่
create table audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid references auth.users(id),
  table_name  text not null, row_id uuid, action text not null,
  old_value   jsonb, new_value jsonb,
  ts          timestamptz not null default now()
);
```

---

## §4 RLS — แทน "กติกา single-writer" ด้วยกำแพงจริง

```sql
alter table accounts       enable row level security;
alter table shorthands     enable row level security;
alter table creatives      enable row level security;
alter table batches        enable row level security;
alter table approvals      enable row level security;
alter table proposals      enable row level security;
alter table results        enable row level security;
alter table progress_events enable row level security;

-- อ่าน: ทุกคนที่ login อ่านได้
create policy read_all on accounts for select using (auth.role() = 'authenticated');
-- (ทำซ้ำกับตารางอื่นที่ UI ต้องอ่าน)

-- config: แก้ได้เฉพาะ admin (ตอบโจทย์ "ตั้งค่าผ่านระบบ" แต่คุมคนแก้)
create policy admin_write_accounts on accounts for all
  using (auth.jwt() ->> 'role' = 'admin');
create policy admin_write_shorthands on shorthands for all
  using (auth.jwt() ->> 'role' = 'admin');

-- อนุมัติ: คนที่อยู่ใน approver list เท่านั้น + approved_by ต้อง = ตัวเอง
create policy insert_approval on approvals for insert
  with check (approved_by = auth.uid()
              and (auth.jwt() ->> 'role') in ('approver','admin'));

-- ตารางที่ "engine เท่านั้นเขียน": proposals/results/progress_events
--   → ไม่มี policy insert สำหรับ authenticated = เขียนไม่ได้เลย
--   → engine ใช้ service_role key ซึ่ง bypass RLS ทั้งหมด
```

**ผลลัพธ์:** เดิมผมเขียนกฎ "backend เขียนโซนนี้ agent เขียนโซนนั้น ห้ามข้าม" แล้วหวังว่าทุกคนทำตาม — **ตอนนี้ Postgres บังคับให้ ใครไม่มีสิทธิ์เขียน = query fail ทันที**

---

## §5 Storage — user อัปโหลดสื่อ

```text
Bucket: creative-media (private)
Path:   {batch_code}/{ad_code_input}.{ext}   เช่น B-20260716-0932/AD710763.png

flow:
1. Web UI ขอ signed upload URL จาก Supabase → user อัปโหลดตรงเข้า Storage (ไม่ผ่าน backend)
2. Web UI insert batch_items { media_path, ad_code_input }
3. Engine อ่าน ad_code_input → หา creatives.ad_code ที่ตรง
   ✅ เจอ    → batch_items.match_status = 'matched', ผูก creative_id
   ❌ ไม่เจอ → 'unmatched' → UI โชว์ dropdown ให้จับคู่มือ → 'manual'
4. Engine ยิงแอด: ดึงไฟล์จาก Storage → upload เข้า Meta → สร้าง creative/ad
```

---

## §6 Realtime — ขับ Scanning Theater

```js
// Web UI subscribe ตอนอยู่หน้า "AI วิเคราะห์"
const chan = supabase
  .channel(`batch:${batchId}`)
  .on('postgres_changes',
     { event: 'INSERT', schema: 'public', table: 'progress_events',
       filter: `batch_id=eq.${batchId}` },
     ({ new: ev }) => {
        // ev.event === 'classified' → tile ติดป้าย funnel + feed 1 บรรทัด + ตัวนับ++
        // ev.event === 'fda_check'  → บรรทัดเตือนคำ อย.
        // ev.event === 'batch_done' → เด้งไปหน้าใบสรุป (อ่านจากตาราง proposals)
        applyToTheater(ev);
     })
  .subscribe();
```

Engine แค่ `insert into progress_events` ทีละแถวระหว่างวิเคราะห์ → Supabase push ให้ UI เอง (ไม่ต้องทำ SSE/tail file เอง) · UI หลุด/refresh → query `progress_events where batch_id` ย้อนหลังได้ (ไม่มี event หาย)

---

## §7 Flow ครบ 5 จังหวะ (เวอร์ชัน Supabase)

```text
① อัปโหลด (Web UI หรือ แชท Hermes)
   Web UI: user เลือกไฟล์ (ตั้งชื่อ = รหัส AD) + บริบทชุด
           → upload Storage → insert batches + batch_items
   Hermes: user พิมพ์ไทย "ขึ้นชุด HMO รอบ 7.7"
           → Hermes insert batches (channel='hermes_chat') → engine หยิบต่อ

② วิเคราะห์ (Engine)
   engine เฝ้า batches.status='pending_analysis' (Realtime subscription หรือ cron 1 นาที)
   สำหรับแต่ละ item:
     - อ่าน ad_code → JOIN creatives → ได้ funnel/shorthand/caption/headline/account พร้อม
       (ไม่ต้องใช้ vision เดา — Lark→Supabase คือความจริง)
     - resolve บัญชี/เพจ/pixel จาก accounts
     - resolve objective/goal จาก shorthands (+ cross-check regen)
     - ตรวจ: ชื่อ↔funnel ตรงไหม · บัญชีดำไหม · pixel พอสำหรับ audience ที่ต้องไหม
     - (เสริม) vision ตรวจทาน: ภาพขัดกับ funnel ที่บรีฟไหม → ถ้าขัด = conflict
     - insert progress_events ทุกก้าว (Realtime → Scanning Theater)
   จบ → insert proposals + batches.status='proposed'

③ ใบสรุป (Web UI อ่าน proposals.plan)
   plan jsonb = กลุ่มต่อ funnel + audience(include/exclude/to_create) + งบ+basis
                + ads[{ad_code, ชื่อที่คำนวณ, caption, headline, fda}] + checks + hold[]

④ อนุมัติ → สร้างจริง
   Web UI/Hermes: insert approvals (approved_by=auth.uid())
   engine เฝ้า approvals → ตรวจ 6 ด่าน (version/expiry/สิทธิ์/งบ/hold/kill-switch)
     ผ่าน → สร้าง audience → campaign → adset → ad (PAUSED) → read-back
            → update creatives {campaign_id, ad_id, ads_status='PAUSED'}
            → insert results (status='created_paused') → audit log ฝั่ง engine
     ตก   → insert results (status='rejected', detail.reason_code)

⑤ เปิดยิง / เขียนกลับ
   Web UI: ปุ่มเปิดยิง → insert approvals(mode='activate') → engine เปิด + update ads_status='ACTIVE'
           → update creatives.status='live' (แทน Lark Stage เดิม)
   จากนั้น regen รับช่วงดูแลต่อ (match จากชื่อ)
```

### 7.3 ตัวอย่าง proposals.plan (jsonb)

```json
{
  "groups": [{
    "funnel": "TOF",
    "campaign_name": "HMO - HAPPY Life - TOF - ENG-LEAD - Acquire - PainPoint - IMG - AD710763 - V01 - 03/07/26",
    "objective": "OUTCOME_ENGAGEMENT", "optimization_goal": "LEAD_GENERATION",
    "daily_budget_thb": 3000, "budget_basis": "playbook: winner TOF 90d",
    "audience": { "include": [{"name":"broad_th_25_65","kind":"broad"}],
                  "exclude": [{"name":"purchasers_180d","kind":"existing","id":"..."}],
                  "to_create": [] },
    "ads": [{ "ad_code":"AD710763", "caption":"...", "headline":"ทักแชทรับโปร ก.ค.",
              "fda": {"status":"pass"} }],
    "checks": { "name_funnel_match": true, "blacklist_hit": false,
                "pixel_ok": true, "expressway_eligible": false }
  }],
  "hold": []
}
```

---

## §8 Engine ↔ regen (cross-check — กันแอดกำพร้า)

```text
ตอน engine โหลด config จาก Supabase:
  1. โหลด accounts + shorthands
  2. เปิด regen/config/accounts/_base.yaml (read-only)
  3. สำหรับทุก shorthand: เช็คว่า regen_slot มี campaign_name_match ที่จะ match ชื่อได้จริง
     - ไม่ match → หยุด + แจ้งทีม (คำย่อนี้จะทำให้เกิดแอดกำพร้า)
  4. เกณฑ์ KPI / นิยาม winner / งบต่อ slot → อ่านจาก regen เท่านั้น (ไม่ก็อปมา Supabase)

→ ได้ทั้ง "แก้ mapping ผ่านระบบ (Supabase)" และ "ปลอดภัย (regen เป็น guard)"
```

---

## §9 Hermes — บทบาทผู้ควบคุม (พรอมป์หดจาก 21 เหลือ ~7 หัวข้อ)

```text
== Hermes Operating Prompt (Creator — operator mode) ==

คุณคือ "ผู้ควบคุม" ระบบสร้างโฆษณา ไม่ใช่ตัวตัดสิน —
Python engine ตัดสินและลงมือ (mapping/ตั้งชื่อ/ด่าน/ยิง Meta) คุณรันและดูแล

1. รันตามตาราง (cron): 08:45 + 16:30 refill · จันทร์ 03:00 audit
   — เรียก engine script เท่านั้น ห้ามยิง Graph API เอง

2. หลังรันทุกครั้ง: อ่าน results + logs ล่าสุด → สรุปเป็นไทยแบบ operation-ready ส่งแชท 09:00

3. รับคำสั่งภาษาไทยจากทีม → แปลงเป็นการ insert แถวใน Supabase:
   "ขึ้นชุด HMO รอบ 7.7" → insert batches(channel='hermes_chat')
   "อนุมัติชุด B-xxx"     → insert approvals(approved_by = ผู้สั่ง)
   — ไม่สร้าง/แก้ Meta เอง engine เป็นผู้ทำ

4. เจอเรื่องผิดปกติ (engine คืน error / results.status=rejected / conflict) →
   อธิบายเป็นไทยว่าเกิดอะไร ทำไม แล้วถามทีม — ห้าม improvise แก้เอง

5. ขอบเขตห้ามข้าม:
   - ห้ามยิง Graph API ตรง · ห้ามถือ token
   - ห้ามแก้ config (accounts/shorthands/regen) — เสนอได้ คนแก้ผ่าน UI/git
   - ห้าม kill/pause แอดที่วิ่งอยู่ (งานของ regen)

6. สั่งงานผ่านแชท = ประตูเดียวกับ Web UI — เขียน Supabase ตารางเดียวกัน
   engine ตรวจด้วยด่านเดียวกัน คุณไม่มีสิทธิ์พิเศษเหนือ Web UI

7. Kill-switch: ถ้าทีมสั่ง "หยุด auto" → set flag ที่ engine อ่าน (ไม่ใช่แค่จำไว้)
```

---

## §10 Web UI — query ที่ใช้ (สำหรับทีม frontend)

| หน้าจอ | อ่าน | เขียน |
|---|---|---|
| อัปโหลด | `accounts`, `shorthands` (dropdown) | Storage + `batches` + `batch_items` |
| Scanning Theater | Realtime `progress_events` | — |
| ใบสรุป | `proposals` (ล่าสุดของ batch) | — |
| อนุมัติ | — | `approvals` |
| บอร์ด kanban | `creatives` (group by status) + `results` | `approvals(mode=activate)` |
| ตั้งค่า/สุขภาพ | `accounts`, `shorthands`, `audit_log` + regen drift check | admin เท่านั้น: `accounts`,`shorthands` |

**Auth:** ใช้ Supabase Auth · role อยู่ใน JWT (`viewer`/`approver`/`admin`) · `approved_by` มาจาก `auth.uid()` เสมอ — client ปลอมไม่ได้ (RLS with_check บังคับ)

---

## §11 อะไรเปลี่ยนจาก spec เดิม (v1 ไฟล์ exchange/)

| v1 (ไฟล์) | v2 (Supabase) |
|---|---|
| `exchange/batches/*.json` | ตาราง `batches` + `batch_items` |
| `exchange/progress/*.jsonl` | ตาราง `progress_events` + Realtime |
| `exchange/proposals/*.json` | ตาราง `proposals` (jsonb) |
| `exchange/approvals/*.json` | ตาราง `approvals` |
| `exchange/results/*.json` | ตาราง `results` + เขียนกลับ `creatives` |
| กติกา single-writer (เอกสาร) | **RLS (บังคับที่ DB)** |
| tmp+rename กัน race | **transaction ของ Postgres** |
| SSE tail file | **Supabase Realtime** |
| Lark Creative Feed | ตาราง `creatives` |
| Ad Account Map (Lark) | ตาราง `accounts` |
| คำย่อ hardcode ในพรอมป์ | ตาราง `shorthands` + cross-check regen |

**ไม่เปลี่ยน:** regen (เกณฑ์/blueprint) · engine safety gates · Graph API · naming · บัญชีดำ · หลักการ "เงินต้องมีคน"
```
