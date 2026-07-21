# ATTOP99 Upload → Mapping → Approval → Meta Graph Flow

## Flow ที่ระบบรองรับตอนนี้

```text
1. User upload media in Web UI
   filename contains AD code, e.g. AD000133.png

2. Web UI uploads file to Supabase Storage
   path = {batch_code}/{ad_code}.ext

3. Web UI inserts:
   - batches
   - batch_items(ad_code_input, media_path)

4. Server-side mapper engine runs:
   npm run engine:map -- <batch_id>

5. Mapper engine:
   - reads batch_items
   - extracts ad_code_input from filename
   - finds matching row in creatives by ad_code
   - updates batch_items.creative_id
   - updates creatives.media_path/status
   - writes progress_events for Realtime Scanning Theater
   - builds proposals.plan with:
     - funnel
     - caption
     - headline
     - account/act_id/page_id/pixel_id
     - objective/optimization from shorthands
     - audience setup
     - daily budget
     - campaign name

6. User reviews /batch/[id]/review and clicks approve.

7. Web UI inserts approvals only.
   Web UI does not hold Meta token.

8. Server-side approval engine runs:
   npm run engine:approve -- --execute

9. Approval engine calls Meta Graph API server-side.
   - Campaign status = PAUSED
   - Ad set status = PAUSED
   - Ads status = PAUSED when media ids are available
   - Writes results back to Supabase
```

## Run worker continuously

Dry-run approval mode:

```bash
npm run engine:worker
```

Real Graph API execution mode:

```bash
npm run engine:worker -- --execute
```

## Required backend env

Put these in `.env.engine`, not `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=...
META_ACCESS_TOKEN=...
META_API_VERSION=v23.0
```

`.env.local` must stay browser-safe:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Creative feed requirement

Rows in `creatives` must exist before upload mapping. The filename AD code maps to `creatives.ad_code`.

Required creative fields:

```json
{
  "ad_code": "AD000133",
  "product": "HMO",
  "account_label": "HAPPY Life",
  "funnel": "TOF",
  "shorthand": "ENG-LEAD",
  "angle": "Acquire",
  "topic": "PainPoint",
  "format": "VDO",
  "version": "V01",
  "caption": "...",
  "headline": "...",
  "status": "briefed"
}
```

For actual ad creation, each ad needs one of these inside `feed_payload`:

```json
{
  "image_hash": "..."
}
```

or

```json
{
  "video_id": "..."
}
```

or

```json
{
  "object_story_id": "..."
}
```

If media ids are absent, engine can still create Campaign + Ad Set PAUSED and will skip Ads with a clear result error.
