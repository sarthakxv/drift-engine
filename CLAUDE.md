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

## Color Tokens (Spotify)

- `--bg-0: #121212` / `--bg-1: #212121` / `--surface: #212121`
- `--text-0: #b3b3b3` / `--text-1: #535353`
- `--accent: #1db954`

## Commands

- `npm run dev` — start dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — run ESLint
