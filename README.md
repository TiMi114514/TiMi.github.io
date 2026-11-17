# Paperwise

Past papers + an AI tutor grounded in your own knowledge base.

- **Frontend**: Next.js 15 (App Router) → static export, hosted on GitHub Pages
- **Accounts**: Supabase Auth (email + password, email verification) & PostgreSQL
- **AI tutor**: RAGFlow, via its OpenAI-compatible chat endpoint
- **Archive**: RAGFlow dataset documents (fallback: Supabase `papers` table, then sample data)

The design follows the supplied reference: warm cream canvas, serif display type, paper-stack hero, archive cards, and a tutor session panel with citations.

| Landing | Archive | Tutor |
| --- | --- | --- |
| ![Landing](docs/screenshots/home.png) | ![Archive](docs/screenshots/archive.png) | ![Tutor](docs/screenshots/tutor.png) |

**Deployed:** [timi114514.github.io/TiMi.github.io](https://timi114514.github.io/TiMi.github.io/)

Already configured in the Supabase project `wksdpsmxwybsmtjjipxa`:

- `profiles`, `papers`, `downloads` tables with RLS and six starter papers
- Email/password auth with confirmation required
- Site URL `https://timi114514.github.io/TiMi.github.io/` and redirect allow-list for `/auth/callback` (plus `http://localhost:3000/**`)

Still environment-dependent:

- RAGFlow runs on the owner's machine (`http://localhost:9380`). The public site therefore reads the archive from Supabase and the tutor reports a connection error until RAGFlow gets a public URL (tunnel or server). On the owner's machine the tutor and the full 700-document archive work.
- Supabase's built-in email sender has low limits. Add custom SMTP (Authentication → Emails) for reliable verification in production.

## Admin dashboard

Sign in with **JackyChen2027@outlook.com** and open **/admin** (an **Admin** link appears in the header for administrators).

![Admin analytics](docs/screenshots/admin.png)

The shell mirrors the reference: search, Overview, App Users, Data, Analytics, Marketing, Domains, Integrations, Security, Code, Agents, Workflows, Emails, Logs, API, Settings, MCP and Secrets.

Working sections:

- **Analytics** — total visits, unique visitors, average visit duration, live visitors, daily traffic chart, page traffic and country breakdown, 7/14/30/90-day ranges, tabs for Traffic overview / Sales overview / Session recordings.
- **Overview** — traffic, account, archive and download summary.
- **App Users** — every Supabase Auth account with verification status and last sign-in.
- **Data** — add, publish/unpublish and delete fallback papers in Supabase.
- **Logs** — recent downloads and raw page views.
- **Settings** — add/remove administrators and inspect the deployment configuration.
- Marketing, Domains, Integrations, Security, Code, Agents, Workflows, Emails, API, MCP, Secrets render structured placeholders.

How the admin access works:

```sql
-- supabase/schema.sql
create table public.admins (email text primary key, created_at timestamptz default now());
create function public.is_admin() returns boolean ... -- checks auth.jwt()->>'email'
```

- Every admin RPC (`admin_analytics`, `admin_list_users`) checks `is_admin()` and is `security definer`.
- RLS grants admins read access to `page_views`, `downloads`, `profiles` and full access to `papers`; everyone else is unchanged.
- Manage the allow-list in **Admin → Settings** or by inserting into `admins`.

Traffic collection is first-party and privacy-friendly: `page_views` stores only the path, an anonymous session id, an optional user id, the referrer, and a coarse country estimate from the browser time zone. No IP addresses and no cookies.

---

## 1. Quick start (local)

```bash
cd paperwise
npm install
npm run dev          # http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
| `NEXT_PUBLIC_RAGFLOW_BASE_URL` | RAGFlow API server, e.g. `http://localhost:9380` |
| `NEXT_PUBLIC_RAGFLOW_API_KEY` | RAGFlow → User settings → API keys |
| `NEXT_PUBLIC_RAGFLOW_CHAT_ID` | RAGFlow → Chat → your assistant (URL contains the id) |
| `NEXT_PUBLIC_RAGFLOW_DATASET_ID` | Comma-separated dataset ids from RAGFlow → Knowledge base (optional; powers the archive) |
| `NEXT_PUBLIC_BASE_PATH` | GitHub Pages project path, e.g. `/TiMi.github.io`; empty for user sites / custom domains |

`NEXT_PUBLIC_*` values are inlined into the browser bundle at build time. That is unavoidable for a fully static site — use a dedicated, revocable RAGFlow API key.

---

## 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (the one referenced here: `wksdpsmxwybsmtjjipxa`).
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql). It creates `profiles`, `papers`, `downloads`, RLS policies and a starter archive.
3. **Authentication → Providers → Email**: enable it. Keep *Confirm email* ON so accounts are email-verified.
4. **Authentication → URL Configuration**:
   - Site URL: `https://timi114514.github.io/TiMi.github.io/` (or your local `http://localhost:3000`)
   - Redirect URLs:
     - `https://timi114514.github.io/TiMi.github.io/auth/callback`
     - `http://localhost:3000/auth/callback`
5. Copy the **anon public** key into `.env.local` / GitHub secrets. Never use the `service_role` key in this app.
6. Optional email template check: **Authentication → Email Templates → Confirm signup** should link to `{{ .ConfirmationURL }}`.

> Verification is performed by Supabase. The site redirects to `/auth/callback`, picks up the session, and sends you to `/account`.

---

## 3. RAGFlow setup

The app talks to RAGFlow from the browser, so the RAGFlow API server must be reachable from the visitor's browser and allow CORS. Both are true for the local instance tested here (`access-control-allow-origin: *`).

1. In RAGFlow create (or reuse) a **chat assistant** and note its `chat_id`. The assistant's `llm_id` is discovered automatically when OpenAI mode is selected.
2. Create an **API key** in user settings.
3. Ingest your past papers and course material into one or more **datasets** (knowledge bases). The archive reads every dataset listed in `NEXT_PUBLIC_RAGFLOW_DATASET_ID` (comma separated, first 100 documents each, "Show more" paginates in the UI).
4. The tutor supports two transports, switchable in **Connection settings** (stored in `localStorage`):
   - **RAGFlow native** (default) — `POST {baseUrl}/api/v1/chats/{chat_id}/completions`. Streams `data.answer` deltas, keeps context through `session_id`, and returns `reference.chunks[].document_name` for the citation chips.
   - **OpenAI-compatible** — `POST {baseUrl}/api/v1/chats_openai/{chat_id}/chat/completions` with `{model, messages, stream}`. RAGFlow requires `model` to be the assistant's internal `llm_id`; the app resolves it via `GET /api/v1/chats` and caches it. This transport does not return citations, so the UI quietly falls back to native mode when the facade rejects the request.
5. **Archive API**:
   ```
   GET  {baseUrl}/api/v1/datasets?page=1&page_size=100                 # dataset names → subjects
   GET  {baseUrl}/api/v1/datasets/{dataset_id}/documents?page=1&page_size=100
   GET  {baseUrl}/api/v1/datasets/{dataset_id}/documents/{document_id} # authenticated download
   ```
   File names like `9700_w19_ms_22.pdf` are turned into readable titles ("9700 · November 2019 · Mark scheme 22"), subjects come from the dataset name, and years come from the file name. If no dataset id is set, the app reads the Supabase `papers` table, then falls back to sample cards.
6. **CORS**: if your deployment does not send `Access-Control-Allow-Origin` for the site origin, put a small reverse proxy in front (Nginx `add_header 'Access-Control-Allow-Origin' '*'` plus preflight handling) or use a tunnel with CORS.
7. **Localhost isn't public**: a site served from GitHub Pages cannot reach `http://localhost:9380` on your machine. Until RAGFlow is exposed:
   - Cloudflare Tunnel / ngrok / frp → put the public URL in Connection settings (tutor page), or
   - deploy RAGFlow to a public server and set `NEXT_PUBLIC_RAGFLOW_BASE_URL`.

   The tutor page has a **Connection settings** panel that stores the base URL / key / ids / mode in `localStorage`, so you can switch endpoints without rebuilding.

---

## 4. Deploy to GitHub Pages

**Live:** https://timi114514.github.io/TiMi.github.io/

Repository: `https://github.com/TiMi114514/TiMi.github.io`

Because the repository is not named `TiMi114514.github.io`, Pages serves it as a **project site**:

```
https://timi114514.github.io/TiMi.github.io/
```

So `NEXT_PUBLIC_BASE_PATH` is `/TiMi.github.io` (the workflow defaults to it; the repo variable can override it). If you later rename the repo to `TiMi114514.github.io` or attach a custom domain, set the variable to empty.

Pages is configured with **Build and deployment → Source: GitHub Actions**. The workflow has built-in defaults for every non-secret value (Supabase URL + publishable key, RAGFlow chat id / dataset ids, base path), so only the RAGFlow API key needs adding as a repository variable or secret:

- Variable or secret: `NEXT_PUBLIC_RAGFLOW_API_KEY`
- Optional overrides: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_RAGFLOW_BASE_URL`, `NEXT_PUBLIC_RAGFLOW_CHAT_ID`, `NEXT_PUBLIC_RAGFLOW_DATASET_ID`, `NEXT_PUBLIC_BASE_PATH`

Push to `main` and [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes `out/`.

Local production build:

```bash
npm run build         # emits ./out
npx serve out         # preview
```

### Integration checks

```bash
npx tsx scripts/test-ragflow.ts     # archive + native/OpenAI chat + follow-up session
```

The local RAGFlow instance used during development responded on `http://localhost:9380`, CORS `*`, assistant `f37a7a58e16c11f19cd2051ed6437597` (Biology dataset) and seven other A-Level datasets. The test prints 700 archive documents and citation names.

---

## 5. How the pieces fit

```
Browser (GitHub Pages, static)
 ├─ Supabase JS ──────────── auth (email verify) + papers/downloads (RLS)
 └─ fetch ────────────────── RAGFlow chat (native or OpenAI-compatible) + dataset API
```

- Browsing the archive is free. Downloading and the tutor require a verified email.
- The tutor streams tokens and renders the cited documents under each answer.
- Downloads are fetched with the RAGFlow key, then saved through a blob URL; RAGFlow's `Content-Disposition` is not required.
- Download history is best-effort logged to `downloads` (RLS keeps it per-user).
- No server is required: `next build` produces a pure static `out/` directory.

> **Windows / exFAT note**: this repository was built from an exFAT drive, where `readlink()` on regular files reports `EISDIR` and breaks Next.js file tracing. `scripts/patch-fs.cjs` normalizes that behaviour and `scripts/next.cjs` loads it for the build and every worker. On NTFS / Linux it is a no-op.

### Security notes

- The RAGFlow key reaches the browser bundle. Treat it as public and revocable; create a dedicated key.
- Supabase RLS: papers are read-only publicly (published only), downloads are per-user, profiles are self-only.
- Do not put the Supabase `service_role` key into any `NEXT_PUBLIC_*` variable.
- For production-grade key hiding, add a proxy (e.g. a Supabase Edge Function or Cloudflare Worker) later; the client API layer is isolated in `lib/ragflow.ts`.

---

## 6. File map

```
app/
  page.tsx              landing page (hero, archive preview, tutor section, how it works)
  papers/page.tsx       archive: search, subject/year filters, downloads
  tutor/page.tsx        AI tutor with auth gating + connection settings
  login|signup|verify   email/password auth flow
  account/page.tsx      profile, verification status, download history
  auth/callback/page.tsx  Supabase email-confirmation landing
components/             Header, Footer, PaperCard, ChatPanel, AuthProvider, ConnectionSettings
lib/
  supabase.ts           client + appUrl()
  ragflow.ts            OpenAI-compatible chat, dataset listing/download
  papers.ts             archive loading + sample fallback
supabase/schema.sql     tables, RLS, starter rows
.github/workflows/      GitHub Pages deployment
```

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank page after deploy, `/repo/_next/...` 404s | Wrong `NEXT_PUBLIC_BASE_PATH`; it must match the repo path, e.g. `/TiMi.github.io` |
| Sign-up works but no email | Supabase → Authentication → Email is disabled, or SMTP is not configured; use the default email service or add custom SMTP |
| Email link returns to `localhost` | Add the GitHub Pages URL to Supabase **Redirect URLs** |
| Tutor says "chat id not configured" | Fill the chat assistant id in Connection settings |
| Tutor request fails with CORS | Allow the Pages origin on RAGFlow, or use a CORS-enabled tunnel |
| Archive shows demo cards | No RAGFlow dataset id and no Supabase papers rows; run `schema.sql` and/or set the dataset id |
| `npm ci` fails in Actions | Commit `package-lock.json` (`npm install` locally first) |
