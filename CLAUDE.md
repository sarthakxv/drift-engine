# Drift Engine

Music taste discovery PWA — clusters Spotify listening data, finds exploration zones, serves discovery candidates with feedback learning.

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Database:** Supabase (Postgres + pgvector + Auth)
- **API:** Spotify Web API (post-Feb-2026 surface only)
- **Deployment:** Vercel + Supabase Edge Functions

## Architecture

- Client never sees Spotify tokens — all API calls through route handlers
- Two-layer embedding: stored genre_vector(64) per-track + runtime 67-dim assembly with per-user z-score normalization
- Weighted k-means clustering with cosine distance
- Three-strategy candidate discovery: genre search, discography crawl, seed expansion

## Conventions

- Do NOT use `any` types
- Do NOT leave `console.log` in production code
- Server components by default; mark `"use client"` only when needed
- Use `@/*` path aliases (maps to project root)
- Route handlers in `app/api/*/route.ts`
- Supabase clients: `lib/supabase/server.ts` (user context), `lib/supabase/service.ts` (admin)
- Environment validation via `lib/env.ts` (zod schema)
- All Spotify endpoints must use exponential backoff with jitter

## Key Files

- `lib/model/genre-vocab.ts` — 64 super-genre vocabulary and mapping functions
- `lib/types.ts` — shared DTOs and type aliases
- `supabase/migrations/` — SQL schema migrations
- `drift-product-plan.md` — full implementation plan (source of truth)

## Color Tokens (Editorial Dark)

- `--bg-0: #0b0f12` / `--bg-1: #121820` / `--surface: #18212b`
- `--text-0: #eef3f7` / `--text-1: #9fb0c2`
- `--accent-a: #11bfae` / `--accent-b: #f3b846` / `--accent-c: #ff6b5a`

## Commands

- `npm run dev` — start dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — run ESLint
