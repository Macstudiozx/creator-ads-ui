# Production Runbook — ATTOP99 Creator Ads UI

## Status levels

### Level 1 — Web UI ready

```bash
npm run dev
```

Use for upload, mapping test, review UI.

### Level 2 — Backend mapping ready

```bash
npm run engine:worker
```

This watches pending batches and approvals. Approval processing is dry-run unless `--execute` is passed.

### Level 3 — Real Meta Graph API execution ready

Requires backend-only `.env.engine`:

```env
SUPABASE_SERVICE_ROLE_KEY=...
META_ACCESS_TOKEN=...
META_API_VERSION=v23.0
```

Run:

```bash
npm run engine:worker -- --execute
```

The engine creates Meta objects as `PAUSED` only.

## One-command readiness check

Local `.env.engine` only:

```bash
npm run ready:prod
```

Production with Doppler token/secret injection:

```bash
npm run ready:prod:doppler
```

The check verifies:

- `.env.local` has only public Supabase URL/anon key
- `.env.local` does not leak service role
- `.env.engine` has service role
- Supabase schema has `accounts.product`
- Supabase schema has creative feed agent metadata columns
- Python engine scripts compile
- Next.js production build passes
- Meta token exists before real Graph API execute mode

## Deploy recommendation

### Internal ATTOP99 deployment

- Web UI: Vercel/Render/Fly/Node host with only:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

- Engine worker: separate private worker/server with:

```env
SUPABASE_SERVICE_ROLE_KEY=...
META_ACCESS_TOKEN=...
META_API_VERSION=v23.0
```

### SaaS / multiple customers later

Do not use one global token forever. Add Meta OAuth + token vault per customer/workspace. Keep token access server-side only.

## Safe launch order

```bash
# 1. Verify
npm run ready:prod

# 2. Start Web UI
npm run dev

# 3. Start dry-run engine first
npm run engine:worker

# 4. After Meta token + approval, start real execute engine
npm run engine:worker:prod

# Alternative without Doppler package alias
HOME=/Users/macstudiozx doppler run -- npm run engine:worker -- --execute
```

## Important

Never put these in Web UI env:

```env
META_ACCESS_TOKEN=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Never create `NEXT_PUBLIC_META_ACCESS_TOKEN`.
