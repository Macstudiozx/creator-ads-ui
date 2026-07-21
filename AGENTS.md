# Creator Ads UI — Agent Instructions

This project is a Next.js + Supabase + Python engine console for Meta Ads creative review and paused-first campaign creation.

## Goals

- Keep the web UI cloneable and runnable for other Hermes users.
- Preserve the security boundary: browser/UI must never hold service-role or Meta tokens.
- Make every change verifiable with concrete commands.

## Local setup

```bash
npm install
cp .env.local.example .env.local
cp .env.engine.example .env.engine
npm run dev
```

Open `http://localhost:3000/settings`.

## Safety rules

- Do not commit `.env.local`, `.env.engine`, `.next/`, `node_modules/`, `output/`, or uploaded media.
- Do not print or paste real `SUPABASE_SERVICE_ROLE_KEY`, `META_ACCESS_TOKEN`, API keys, cookies, or auth tokens.
- Browser code may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server routes and Python scripts may read `.env.engine` for service-role and Meta tokens.
- Meta execution must remain PAUSED-first and human-approval gated.
- If a file in `output/` is useful as documentation, move/sanitize it under `docs/` before committing.

## Verification before reporting done

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

For runtime checks, verify exact URLs with curl/browser:

```bash
curl -i http://localhost:3000/settings
curl -i http://localhost:3000/api/settings
```

If credentials are missing, report exactly which capability is blocked; do not fake Meta/Supabase responses.

## Hermes-specific notes

When another Hermes user clones this repo, they should run Hermes from the repo root so this file is loaded as project context. Prefer direct, practical Thai guidance for the user, but keep code comments/docs in clear English unless the surrounding file is Thai.
