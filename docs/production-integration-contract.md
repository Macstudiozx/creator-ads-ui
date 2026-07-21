# ATTOP99 Creator Ads — Production Integration Contract

## 1) Accounts real data

`accounts` now separates:

- `brand` — brand/business group, e.g. `HMO`, `DRJADE`, `ASTA`, `OMG`
- `product` — product line/SKU group used by planning and creative feed, e.g. `HMO`, `KENG ASTA`, etc.
- `account_label` — human label shown in UI and used by creative rows
- `act_id`, `page_ids`, `default_page_id`, `pixel_id`

Run migration:

```sql
-- docs/migrations/20260717_accounts_product_agent_feed.sql
```

## 2) Creative feed from another agent

Supported path: another agent/backend writes rows to `public.creatives` using backend-only Supabase credentials.

Do **not** use browser anon key for agent writes. Use server-side `SUPABASE_SERVICE_ROLE_KEY` or a backend endpoint with proper auth.

Required fields:

| field | example |
|---|---|
| `ad_code` | `AD710763` |
| `product` | `HMO` |
| `account_label` | `HAPPY Life` |
| `funnel` | `TOF` / `MOF` / `BOF` |
| `shorthand` | `ENG-LEAD` / `LEAD-LEAD` / `ENG-PTM` |
| `angle` | `Acquire` |
| `format` | `VDO` |
| `version` | `V01` |
| `caption` | real caption |
| `headline` | real headline |
| `status` | `briefed` |

Optional agent metadata:

| field | purpose |
|---|---|
| `source_agent` | agent name, e.g. `creative-feed-agent` |
| `external_ref` | idempotency key from source job/system |
| `feed_payload` | original JSON payload for audit/debug |
| `ingested_at` | database default timestamp |

CSV import command:

```bash
npm run import:creatives -- data/your-real-creatives.csv
```

## 3) Meta Graph API real execution

Browser/Web UI must not hold or call with Meta tokens.

Production-safe flow:

1. Web UI inserts row into `approvals` after human approval.
2. Backend/Python engine watches `approvals`.
3. Engine reads `proposals.plan` + account mapping.
4. Engine calls Meta Graph API server-side only.
5. Engine creates campaigns/adsets/ads as `PAUSED` first.
6. Engine writes `results` with created IDs and read-back verification.
7. `/board` shows statuses from `creatives` + `results`.

This keeps:

- no Meta token in browser
- no service role in Web UI
- RLS intact
- audit trail in `approvals` and `results`

## 4) Approval modes

| mode | meaning |
|---|---|
| `create_paused` | create Meta objects paused only |
| `activate` | backend activates already-created IDs |

## 5) Minimum engine env

Backend-only env, never `NEXT_PUBLIC_*`:

```env
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
META_ACCESS_TOKEN=...
META_API_VERSION=v23.0
```
