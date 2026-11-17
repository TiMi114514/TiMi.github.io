# Differential Quant

Past papers, an AI tutor grounded in your own knowledge base, and human tutors on demand.

- **Frontend**: Next.js 15 (App Router) → static export, hosted on GitHub Pages
- **Accounts**: Supabase Auth (email + password, email verification) & PostgreSQL
- **AI tutor**: RAGFlow OpenAI-compatible endpoint for clean final answers, with retrieval citations and a subject/database selector
- **Human tutors**: requests are stored in Supabase and reviewed in the admin dashboard
- **Archive**: RAGFlow dataset documents (fallback: Supabase `papers` table, then sample data)
- **Archive search**: lightweight preview plus targeted filename search with year, season, subject and paper-type filters
- **Study tools**: Pomodoro timer with a black full-screen focus mode, plus full-screen chat

The brand mark is the supplied **dx** image (cropped and exported to `public/brand-mark.png`, favicon and Apple touch icon). The interface keeps the warm cream canvas and editorial serif type, now using Source Serif 4 for flatter, wider display letterforms.

| Landing | Archive | AI tutor |
| --- | --- | --- |
| ![Landing](docs/screenshots/home.png) | ![Archive](docs/screenshots/archive.png) | ![Tutor](docs/screenshots/tutor.png) |

| Pomodoro page | Focus screen |
| --- | --- |
| ![Pomodoro page](docs/screenshots/pomodoro-page.png) | ![Pomodoro focus](docs/screenshots/pomodoro.png) |

**Deployed:** [timi114514.github.io/TiMi.github.io](https://timi114514.github.io/TiMi.github.io/)

Already configured in the Supabase project `wksdpsmxwybsmtjjipxa`:

- `profiles`, `papers`, `downloads`, `download_events`, `page_views`, `admins`, `teacher_applications`, `human_tutor_requests` tables with RLS and six starter papers
- private `teacher-documents` storage bucket (10 MB limit, images/PDF/DOC/DOCX)
- Email/password auth with confirmation required
- Site URL `https://timi114514.github.io/TiMi.github.io/` and redirect allow-list for `/auth/callback` and `/auth/reset` (plus `http://localhost:3000/**`)

Still environment-dependent:

- RAGFlow runs on the owner's machine (`http://localhost:9380`). The public site therefore reads the archive from Supabase and the tutor reports a connection error until RAGFlow gets a public URL (tunnel or server). On the owner's machine the tutor and the full ~4,500-document archive work.
- Supabase's built-in email sender has low limits. Add custom SMTP (Authentication → Emails) for reliable verification in production.

## Tutors: AI and human

Both live under **/tutor**, with a two-pill switcher:

- **/tutor** — AI tutor. Answers come from RAGFlow's OpenAI-compatible endpoint, which returns the final answer without the model's chain of thought. A knowledge-base selector switches between the assistants created in RAGFlow (`DQ · General`, Biology, Chemistry, Mathematics, Economics); citations are fetched from the retrieval API and rendered under each answer. The chat header has a full-screen button.
- **/tutor/human** — human tutor. Signed-in, verified students submit the subject, question, preferred time and contact email. Requests land in `human_tutor_requests` with `pending` status and the student sees their own request history.

The assistants are real RAGFlow chats named with the `DQ · ` prefix. Physics, Further Mathematics and Computer Science datasets have documents but zero parsed chunks in RAGFlow, so they are not offered until those datasets are parsed. Add more assistants with the same prefix and they appear in the selector automatically (cached for ten minutes).

![Human tutor](docs/screenshots/human-tutor.png)

### Teacher applications

The sign-up form has an optional **Apply to become a teacher** checkbox. It reveals subjects, a personal statement and an optional photo/document (JPG, PNG, WebP, PDF, DOC or DOCX, maximum 10 MB). On successful sign-up:

- the file is uploaded to the private `teacher-documents` bucket;
- the application is written to `teacher_applications` as `pending`, with the statement and attachment metadata;
- a copy is forwarded to **JackyChen2027@outlook.com** through FormSubmit, with the applicant's email, statement and file attached.

Admins review applications under **Admin → Tutors**, can open the attachment through a one-hour signed URL, and can approve or reject. The student's account page shows the review status.

> FormSubmit requires a one-time activation: the first application sends an activation link to the owner's inbox. Click it once, then future applications arrive by email. Until activation, every application is still stored in Supabase and visible in the admin dashboard. The email relay is a third-party service; the Supabase copy is the source of truth.

![Teacher application](docs/screenshots/teacher-application.png)

- Public insert policy: only `pending` rows, so nobody can self-approve.
- Storage upload policy allows anonymous uploads into the bucket; reads are admin-only.
- Students can read only their own application (RLS), admins can read and update everything.
- Approved teachers are the pool used for human tutor sessions.

## Archive access

Browsing and downloading are public — no account is required.

- Guests are limited to **one document per second**. The timestamp lives in `sessionStorage` and the check runs before the RAGFlow or Supabase download starts.
- This is a client-side throttle; a static GitHub Pages site cannot enforce a hard server-side rate limit. If you need strict enforcement, proxy downloads through a Cloudflare Worker or Supabase Edge Function.
- Signed-in users are not throttled, and their downloads are logged to the `downloads` table. Guest downloads are recorded in `download_events` so the homepage counters include them.
- **No full archive traversal on page load.** `/papers` fetches a lightweight preview — the first documents of up to four datasets — and shows them as large download cards.
- **Further search is targeted.** The filename box plus filters for **year**, **exam season**, **dataset/subject** and **paper type** build a RAGFlow `keywords` query per dataset instead of downloading everything. Results are grouped by dataset and keep the original file names.
- File names such as `9700_w19_ms_22.pdf` and `9990_m26_gt.pdf` are parsed for filters: year (2019 / 2026), season (June / March), type (question paper `qp`, mark scheme `ms`, grade thresholds `gt`, examiner report `er`, …).
- The preview is cached for 30 minutes. A-Level Chinese 9868 has 0 documents, so it has no card; the other eight datasets contain 4,503 documents.
- The homepage shows two live counters from `home_stats()`: users/files downloaded in the last 30 days, and learners online now (distinct sessions with page views in the last five minutes).

## Password reset

- `/forgot-password` calls `supabase.auth.resetPasswordForEmail` with `redirectTo = /auth/reset`.
- `/auth/reset` waits for the recovery session, then calls `updateUser({ password })`.
- Supabase's redirect allow-list already covers `/auth/reset` through the `/**` patterns.
- The built-in email sender is rate-limited; configure SMTP before relying on reset emails.
- Administrator sign-in (password or email-confirmation link) redirects straight to `/admin`; everyone else lands on `/account`.

## Motion

Animations are pointer-driven and transform-only:

- the hero paper stack follows the mouse through one `requestAnimationFrame` handle;
- buttons, the logo and cards animate on hover;
- admin bars transition their width.

No timers, polling or additional requests drive the visuals, and `prefers-reduced-motion` disables them. The analytics page refreshes only on open, on manual refresh, and at most every five minutes while the tab is visible. The Pomodoro clock is the only one-second timer, and it never touches the network.

## Pomodoro timer

**Pomodoro** is a top-level navigation item alongside **Past papers** and **Tutors**, at `/pomodoro`:

- defaults to **25-minute focus / 5-minute break** and lets each user adjust focus (1–180) and break (1–60) durations. Changes apply immediately when paused, or from the next session.
- start, pause, reset and switch between focus and break;
- the remaining time and custom durations survive navigation and reloads through `localStorage`;
- the compact header control stays in sync with the page, so the timer can be started anywhere;
- **Focus screen** enters the Fullscreen API with a pure black background showing the current clock and the remaining time, plus pause, reset, break and exit controls;
- if the browser blocks fullscreen, the same black overlay still opens until you close it.

No request is made while the timer runs.

## Admin dashboard

Sign in with **JackyChen2027@outlook.com**; a successful administrator sign-in redirects straight to **/admin** (an **Admin** link also appears in the header).

> The account was created through the site, added to the `admins` table, and its email was confirmed directly in Supabase because the built-in email sender was rate-limited at setup time. Sign in with the password chosen at registration; add custom SMTP for future verification emails.

![Admin analytics](docs/screenshots/admin.png)

The shell mirrors the reference: search, Overview, App Users, Tutors, Data, Analytics, Marketing, Domains, Integrations, Security, Code, Agents, Workflows, Emails, Logs, API, Settings, MCP and Secrets.

Working sections:

- **Analytics** — total visits, unique visitors, average visit duration, live visitors, daily traffic chart, page traffic and country breakdown, 7/14/30/90-day ranges, tabs for Traffic overview / **Downloads** / Sales overview / Session recordings. The Downloads tab adds total downloads, unique downloaders, downloads per day, a daily chart, top downloaded files and downloads by dataset.
- **Overview** — seven live cards (visits, accounts, 30-day downloads, pending tutor reviews, learners online, papers, all-time downloads) plus recent account and guest downloads.
- **App Users** — every Supabase Auth account with verification status and last sign-in; filter by verified/pending and export the filtered list to CSV.
- **Tutors** — approve/reject teacher applications (with statement and attachment) and triage human tutor requests (`pending → contacted → closed`); search across both lists, export CSV, and see pending counts as a sidebar badge.
- **Data** — add, publish/unpublish and delete fallback papers in Supabase.
- **Logs** — recent signed-in and guest downloads plus raw page views, with search and CSV export.
- **Settings** — add/remove administrators, inspect the deployment and adjust the admin-only RAGFlow connection override (the panel is no longer shown to visitors).
- Marketing, Domains, Integrations, Security, Code, Agents, Workflows, Emails, API, MCP, Secrets render structured placeholders.

![Admin tutors](docs/screenshots/admin-tutors.png)

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
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql). It creates the archive, account, analytics and tutor tables, RLS policies, admin functions and a starter archive.
3. **Authentication → Providers → Email**: enable it. Keep *Confirm email* ON so accounts are email-verified.
4. **Authentication → URL Configuration**:
   - Site URL: `https://timi114514.github.io/TiMi.github.io/` (or your local `http://localhost:3000`)
   - Redirect URLs:
     - `https://timi114514.github.io/TiMi.github.io/auth/callback`
     - `https://timi114514.github.io/TiMi.github.io/auth/reset`
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/reset`
5. Copy the **anon public** key into `.env.local` / GitHub secrets. Never use the `service_role` key in this app.
6. Optional email template check: **Authentication → Email Templates → Confirm signup** and **Reset password** should link to `{{ .ConfirmationURL }}`.

> Verification is performed by Supabase. The site redirects to `/auth/callback`, picks up the session, then sends administrators to `/admin` and everyone else to `/account`.

---

## 3. RAGFlow setup

The app talks to RAGFlow from the browser, so the RAGFlow API server must be reachable from the visitor's browser and allow CORS. Both are true for the local instance tested here (`access-control-allow-origin: *`).

1. Create an **API key** in RAGFlow user settings.
2. Ingest your past papers and course material into one or more **datasets** (knowledge bases). The archive no longer reads every page on load: `/papers` fetches a preview page from up to four datasets, and detailed searches use RAGFlow's `keywords` filter. `NEXT_PUBLIC_RAGFLOW_DATASET_ID` is only a fallback when the datasets API is unavailable.
3. Create one **chat assistant per subject**, named `DQ · <Subject>` (for example `DQ · Chemistry`), and bind it to that subject's dataset. A `DQ · General` assistant can bind several datasets. The tutor lists every assistant with the `DQ · ` prefix, so a new one appears in the selector automatically. Datasets with zero parsed chunks cannot be bound to an assistant until they are parsed.
4. The public tutor uses the **OpenAI-compatible** endpoint for answers:
   `POST {baseUrl}/api/v1/chats_openai/{chat_id}/chat/completions` with `{model, messages, stream}`. RAGFlow expects `model` to be the assistant's internal `llm_id`; the app resolves it via `GET /api/v1/chats` and caches it. This endpoint returns only the final answer, so the model's chain of thought is not shown. Citations are fetched separately from `POST /api/v1/retrieval` using `document_keyword`.
   The native endpoint remains in `lib/ragflow.ts` for debugging, but the UI forces OpenAI mode.
5. **Admin-only connection override**: **Admin → Settings → RAGFlow connection** stores the base URL, key, chat id, dataset ids and mode in the admin browser's `localStorage`. Visitors never see this panel.
5. **Archive API**:
   ```
   GET  {baseUrl}/api/v1/datasets?page=1&page_size=100                 # dataset names + counts
   GET  {baseUrl}/api/v1/datasets/{dataset_id}/documents?page=1&page_size=100&keywords=9990_m26
   GET  {baseUrl}/api/v1/datasets/{dataset_id}/documents/{document_id} # authenticated download
   ```
   File names are shown exactly as stored (`9990_m26_gt.pdf`), grouped by dataset name; the filters parse year, exam season and paper type from the name but the displayed title remains the raw filename. If RAGFlow is unreachable, the app falls back to the Supabase `papers` table.
6. **CORS**: if your deployment does not send `Access-Control-Allow-Origin` for the site origin, put a small reverse proxy in front (Nginx `add_header 'Access-Control-Allow-Origin' '*'` plus preflight handling) or use a tunnel with CORS.
7. **Localhost isn't public**: a site served from GitHub Pages cannot reach `http://localhost:9380` on your machine. Until RAGFlow is exposed:
   - Cloudflare Tunnel / ngrok / frp → put the public URL in **Admin → Settings → RAGFlow connection**, or
   - deploy RAGFlow to a public server and set `NEXT_PUBLIC_RAGFLOW_BASE_URL`.

   The connection panel is admin-only. Visitors always use the values compiled into the build; they never see the base URL, key, chat id or dataset ids.

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
npx tsx scripts/test-ragflow.ts     # archive, assistants, OpenAI answers and retrieval citations
```

The local RAGFlow instance used during development responded on `http://localhost:9380`, CORS `*`, with nine datasets (eight containing documents, 4,503 total). The test prints every document and citation names.

---

## 5. How the pieces fit

```
Browser (GitHub Pages, static)
 ├─ Supabase JS ──────────── auth (email verify) + papers/downloads (RLS)
 └─ fetch ────────────────── RAGFlow OpenAI-compatible chat + retrieval citations + dataset API
```

- Browsing and downloading are public; guests are throttled to one document per second. Both tutors require a signed-in, verified account.
- The AI tutor streams tokens and renders the cited documents under each answer; human tutor requests are stored in Supabase and triaged by admins.
- Downloads are fetched with the RAGFlow key, then saved through a blob URL; RAGFlow's `Content-Disposition` is not required.
- Download history is best-effort logged to `downloads` for signed-in users (RLS keeps it per-user).
- Archive results are cached in `sessionStorage` for 30 minutes; analytics polling is five minutes and pauses on hidden tabs.
- No server is required: `next build` produces a pure static `out/` directory.

> **Windows / exFAT note**: this repository was built from an exFAT drive, where `readlink()` on regular files reports `EISDIR` and breaks Next.js file tracing. `scripts/patch-fs.cjs` normalizes that behaviour and `scripts/next.cjs` loads it for the build and every worker. On NTFS / Linux it is a no-op.

### Security notes

- The RAGFlow key reaches the browser bundle. Treat it as public and revocable; create a dedicated key.
- Supabase RLS: papers are read-only publicly (published only), downloads/teacher applications/human requests are per-user, profiles are self-only. Admin writes are gated by `is_admin()`.
- The guest one-download-per-second check is client-side. It is a fair-use throttle, not a security boundary; use a proxy if you need hard enforcement.
- Do not put the Supabase `service_role` key into any `NEXT_PUBLIC_*` variable.
- For production-grade key hiding, add a proxy (e.g. a Supabase Edge Function or Cloudflare Worker) later; the client API layer is isolated in `lib/ragflow.ts`.

---

## 6. File map

```
app/
  page.tsx              landing page (hero, archive preview, tutor section)
  papers/page.tsx       archive: preview cards + targeted filename/year/season/type search
  tutor/page.tsx        AI tutor with auth gating and knowledge-base selector
  tutor/human/page.tsx  human tutor request form + request history
  pomodoro/page.tsx     focus/break timer with adjustable durations
  login|signup|verify   email/password auth flow; optional teacher application with attachment
  forgot-password/page.tsx  request a reset link
  auth/reset/page.tsx   choose a new password from the recovery link
  account/page.tsx      profile, verification status, teacher application, downloads
  admin/                Analytics, Overview, App Users, Tutors, Data, Logs, Settings, placeholders
  auth/callback/page.tsx  Supabase email-confirmation landing
components/             Header, HomeStats, Pomodoro, PomodoroProvider, HeroPapers, PaperCard, ChatPanel, TutorWorkspace, TutorTabs, AdminShell, AnalyticsTracker
lib/
  supabase.ts           client + appUrl()
  ragflow.ts            OpenAI-compatible chat, assistant list, retrieval citations, preview/search/download
  paper-meta.ts         filename parser for year, exam season and paper type
  session.ts            shared anonymous browser-session id
  teacher-email.ts      FormSubmit forwarding for teacher applications
  analytics.ts          admin analytics types, country estimate, formatters
  pomodoro.ts           timer helpers, defaults and duration clamping
  papers.ts             archive loading (all datasets, paginated), 30-minute cache, sample fallback
public/                 brand-mark.png, favicon.png, apple-touch-icon.png
supabase/schema.sql     tables, RLS, functions, storage bucket, starter rows
.github/workflows/      GitHub Pages deployment
```

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank page after deploy, `/repo/_next/...` 404s | Wrong `NEXT_PUBLIC_BASE_PATH`; it must match the repo path, e.g. `/TiMi.github.io` |
| Sign-up works but no email | Supabase → Authentication → Email is disabled, or SMTP is not configured; use the default email service or add custom SMTP |
| Password reset email never arrives | The built-in sender is rate-limited; add SMTP and retry after the limit resets |
| Email link returns to `localhost` | Add the GitHub Pages URL to Supabase **Redirect URLs** |
| Tutor says "tutor unavailable" | Fill the chat assistant id under **Admin → Settings → RAGFlow connection** |
| Knowledge-base selector is empty | Create/parse datasets, then create assistants named `DQ · <Subject>` in RAGFlow |
| AI answer repeats its reasoning | The tutor uses the OpenAI-compatible endpoint; verify the assistant is reachable through `/api/v1/chats_openai/{id}/chat/completions` |
| Teacher application email never arrives | Click the FormSubmit activation link sent to the owner; the Supabase copy is still in **Admin → Tutors** |
| Attachment will not upload | Check the 10 MB bucket limit and the allowed MIME types |
| Pomodoro fullscreen is blocked | The black overlay still opens; allow fullscreen in the browser to enter the real fullscreen mode |
| Guest cannot download a second paper immediately | Expected: guests are limited to one document per second |
| Tutor request fails with CORS | Allow the Pages origin on RAGFlow, or use a CORS-enabled tunnel |
| Archive only shows a few cards | Expected: the preview is intentionally small; use the search filters for the full archive |
| Detailed search misses a file | Use a substring of the raw name (for example `9990_m26`), or clear the year/season/type filters |
| Homepage counters stay at 0 | Downloads are counted after the first successful download; only the last 30 days are included |
| Archive shows demo cards | RAGFlow is unreachable and the Supabase `papers` table is empty; run `schema.sql` and/or check the connection |
| `npm ci` fails in Actions | Commit `package-lock.json` (`npm install` locally first) |
