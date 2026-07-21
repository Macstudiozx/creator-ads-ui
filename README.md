# Creator Ads UI

Creator Ads UI is a Next.js console for a Meta Ads creative workflow:

1. upload creative assets to Supabase Storage,
2. map/analyze the batch with a Python engine,
3. review a proposal in the UI,
4. approve server-side campaign creation in Meta as **PAUSED first**.

The app is designed so another Hermes Agent user can clone the repository, open it as a project, and run the UI locally.

## What is included

- Next.js App Router UI: settings, upload, board, batch scanning, review.
- Supabase browser auth/storage path for local and production use.
- Server-only Python engine scripts for Supabase service-role writes and Meta Graph API execution.
- Mock/demo mode when Supabase env is omitted.
- Project instructions for Hermes/agent users in `AGENTS.md` and `.hermes.md`.

## Safety model

- Browser code may only use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY`, `META_ACCESS_TOKEN`, and Meta execution stay server-side in `.env.engine` or deployment secrets.
- Meta object creation should remain **PAUSED-first** and require human approval before activation.
- Do not commit `.env.local`, `.env.engine`, generated build output, uploaded media, or engine logs.

## Quick start

```bash
git clone https://github.com/Macstudiozx/creator-ads-ui.git
cd creator-ads-ui
npm install
cp .env.local.example .env.local
cp .env.engine.example .env.engine
npm run dev
```

Open:

```text
http://localhost:3000/settings
```

If you leave Supabase env empty, most UI surfaces can still be inspected in mock/demo mode. Uploading to real storage and writing real batch/proposal records requires Supabase setup.

## Environment files

### `.env.local` — browser-safe public config

Create from `.env.local.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

These keys are public, but the target Supabase project must use RLS correctly.

### `.env.engine` — server-only secrets

Create from `.env.engine.example`:

```env
SUPABASE_SERVICE_ROLE_KEY=
META_ACCESS_TOKEN=
META_API_VERSION=v23.0
```

Never expose these values to browser code and never commit the real file.

## Supabase setup

1. Create a Supabase project.
2. Run the SQL in `docs/supabase-setup.sql`.
3. Add browser values to `.env.local`.
4. Add server/engine values to `.env.engine`.
5. Create or invite at least one Supabase Auth user.

Optional seed:

```bash
npm run seed:real-config
```

## Common commands

```bash
npm run dev              # local Next.js dev server
npm run build            # production build check
npm run lint             # ESLint check
npm run typecheck        # TypeScript no-emit check
npm run verify           # lint + typecheck + build
npm run ready:prod       # production readiness checklist; does not print secrets
npm run mock:engine -- <batch_id>
npm run engine:map -- <batch_id>
npm run engine:approve   # dry run by default
```

Real Meta writes require:

```bash
npm run engine:approve -- --execute
```

The approval script is server-side and should create/read back Meta objects as PAUSED.

## Hermes Agent usage

After cloning, run Hermes from the project root so it loads project context:

```bash
cd creator-ads-ui
hermes
```

Recommended first prompt:

```text
อ่าน AGENTS.md แล้วช่วยตั้งค่าโปรเจคนี้ให้รัน local ได้แบบปลอดภัย ห้ามเปิดเผย service_role หรือ Meta token ใน browser
```

Hermes will load `AGENTS.md`/`.hermes.md` and should follow the clone/run/safety workflow documented there.

## Troubleshooting

### `npm run lint` fails because config is missing

This repository includes `eslint.config.mjs`. If you cloned an older copy, pull latest and rerun `npm install`.

### Login works but role looks like viewer

Set user metadata/app metadata in Supabase to one of:

```json
{"role":"admin"}
```

or

```json
{"role":"approver"}
```

### Upload says “กรุณา login ก่อน upload”

The app detected real Supabase env, so it is not in mock mode. Login with a Supabase Auth user first.

### Batch page waits forever for engine

Upload can succeed before the Python engine writes `progress_events`. Run:

```bash
npm run engine:map -- <batch_id>
```

or use the mock/review fallback in the UI for layout testing.

## Repository hygiene checklist

Before pushing changes:

```bash
npm run verify
git status --short
git check-ignore .env.local .env.engine .next node_modules output/meta-media/AD000133.png
```

Make sure no real secret files are staged.

## License

MIT — see `LICENSE`.
