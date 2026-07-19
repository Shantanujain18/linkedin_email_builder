# ReachPod

Next.js app that turns a resume + LinkedIn post CSV into reviewable outreach drafts, with SMTP send and multi-user auth via **Supabase**.

## Stack

- **Auth:** Supabase Auth (email/password)
- **Database:** Postgres via `DATABASE_URL` (Supabase-hosted; swap URI later for your own Postgres)
- **Files:** Supabase Storage bucket `resumes` (swap `lib/storage.ts` later for S3/R2)
- **AI / mail:** OpenAI + nodemailer (unchanged)

## One-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Providers → Email:** enable Email. For local testing you can disable “Confirm email”.
3. **Authentication → URL Configuration:** set Site URL to your app origin, and add Redirect URLs for:
   - `http://localhost:3002/**` (local)
   - `https://your-production-domain/**`
   - specifically include `/auth/callback` (used by password reset)
4. **SQL Editor:** run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) (tables, RLS, `resumes` bucket policies).
5. **Project Settings → API:** copy Project URL, publishable/anon key, and **service_role** key.
6. **Project Settings → Database:** copy the **connection string** (URI). Prefer the **Transaction pooler** (`:6543`) for serverless/Vercel.

## Local run

```bash
cd email_sender
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

```bash
npm run dev -- -p 3002
```

Open [http://localhost:3002](http://localhost:3002), sign up, then use Resume → CSV → Generate → SMTP → Send.

## Portability (leave Supabase later)

| Concern | How to switch |
|--------|----------------|
| Postgres | Change `DATABASE_URL` only (Drizzle/SQL, not `supabase.from`) |
| Resumes | Replace [`lib/storage.ts`](lib/storage.ts) with S3/R2; migrate objects |
| Auth | Thin wrapper in [`lib/auth.ts`](lib/auth.ts) — swap provider and map user IDs |

## SMTP

Configure Gmail App Password in the app **SMTP** page. Credentials are stored per user in Postgres.

## Migrate old SQLite data

If you still have `data/email_sender.sqlite`:

```bash
MIGRATE_CLEAR=1 npm run migrate:sqlite
# or set a known password for a newly created auth user:
MIGRATE_PASSWORD='YourPassword1!' MIGRATE_CLEAR=1 npm run migrate:sqlite
```

This creates/finds the Supabase Auth user for each SQLite email, uploads the local resume to Storage, and copies posts/drafts/send log/profile/SMTP (IDs preserved).

## Notes

- Do not commit `.env`, `.env.local`, or `SUPABASE_SERVICE_ROLE_KEY`.
- Old SQLite under `data/` is unused after migration; keep a backup.
