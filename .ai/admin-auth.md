# Admin Authentication (Google login, @pingcap.com only)

The admin CMS (`/admin/*`) and its API routes (`/api/*`) are gated by Google
sign-in, restricted to the `pingcap.com` email domain. Implemented with
[Auth.js v5](https://authjs.dev) (`next-auth@5`).

## Gate behaviour (see `src/middleware.ts`)

| Environment                | Condition                                       | Behaviour                                             |
| -------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Production                 | `VERCEL_ENV === 'production'`                   | `/admin` + `/api` return **404** (unchanged)          |
| Preview — non-`staging`    | `VERCEL_ENV === 'preview'`, git ref ≠ `staging` | **404** — admin is hidden on per-PR previews          |
| Preview — `staging` branch | `VERCEL_ENV === 'preview'`, git ref = `staging` | **Require** a signed-in `@pingcap.com` Google user    |
| Local (`pnpm dev`)         | `VERCEL_ENV` unset                              | **No** login gate — localhost is not internet-exposed |

So the admin only ever appears on the single **staging** deployment, and that
deployment requires login. The staging URL is public and predictable, so the
login — not the obscurity of the URL — is what actually protects it.

Staging detection uses `VERCEL_GIT_COMMIT_REF` (the deployed branch), since
`VERCEL_ENV` is `preview` for every branch preview and can't distinguish them.

Domain enforcement is in the `signIn` callback in `src/auth.ts`: a login is
accepted only when Google reports `email_verified` **and** the email ends in
`@pingcap.com`. The Google `hd` param is only a UI hint and is not trusted.

Unauthenticated requests on staging: browser navigations are redirected to
`/api/auth/signin`; API calls get `401`.

## Required environment variables

Set these on Vercel for the **Preview** environment (and in `.env.local` only if
you want to exercise the real login flow locally):

| Variable             | What it is                                                   |
| -------------------- | ------------------------------------------------------------ |
| `AUTH_SECRET`        | Session/JWT signing secret. Generate with `npx auth secret`. |
| `AUTH_GOOGLE_ID`     | Google OAuth 2.0 **Client ID**.                              |
| `AUTH_GOOGLE_SECRET` | Google OAuth 2.0 **Client secret**.                          |

> `AUTH_SECRET` **must** be set on every deployed (preview) environment. Without
> it the gate cannot verify sessions. Local dev falls back to an insecure dev
> secret purely so `pnpm dev` doesn't crash — it never protects anything, because
> localhost bypasses the gate.

## Google Cloud Console setup (one time)

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**.
2. **Authorized redirect URIs** — add the callback for each host that serves the
   admin:
   - `https://<your-preview-host>/api/auth/callback/google`
   - (optional, for local login) `http://localhost:3000/api/auth/callback/google`

   Preview hostnames rotate per deploy. Prefer a **stable** preview alias (e.g.
   the staging branch alias `website-launchpad-git-staging-pingcap.vercel.app`)
   and register its callback once. `trustHost: true` is already set so Auth.js
   accepts the preview host.

3. Copy the Client ID / secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. (Recommended) On the OAuth consent screen, set **User type = Internal** so
   only the PingCAP Google Workspace org can even attempt sign-in — defense in
   depth on top of the `signIn` domain check.

## Rollout note

Merging this does not lock anyone out of production (admin is already 404 there).
It **does** gate preview/staging: once deployed, `AUTH_SECRET` + the Google
credentials must be present in the Preview environment or the admin will reject
sign-in. Configure them before/with the merge.

## Audit logging (user operation records)

Every state-changing admin operation emits one structured JSON line via
`logAudit()` (`src/lib/audit.ts`). On Vercel these land in the deployment's
runtime logs (Project → Logs) and can be forwarded to a log drain for retention.

Logged routes: `POST /api/publish` (success + main-token denial),
`POST /api/pages/delete`, `POST /api/pages/move`, `POST /api/pages/copy`,
`PUT /api/pages/[...slug]` (draft save), `POST /api/admin/upload-image`.

Each line carries: `ts`, `actor` (the signed-in Google email; `local-dev` when
login is bypassed locally), `ip`, `env`, `action`, `target`, optional `targetTo`
/ `branch` / `detail`, and `status` (`success` | `denied` | `error`). Filter the
logs by the `[audit]` prefix, e.g.:

```
[audit] {"ts":"…","actor":"alice@pingcap.com","action":"delete","target":"lp/foo","status":"success","detail":"2 file(s)"}
```

The actor is only meaningful where login is enforced (the staging deployment).

## Admin UI: user menu + page authorship

- **User menu** — the admin shell top bar shows the signed-in Google name/email
  with a **Sign out** button (`src/components/admin/UserMenu.tsx`, server-action
  `signOut`). Hidden when there is no session (local dev).
- **Page authorship** — `meta.createdBy` / `createdAt` / `modifiedBy` / `modifiedAt`
  are stamped server-side on every write (`stampAuthorship`, `src/lib/authorship.ts`)
  from publish, draft-save, and copy. The creator is set once and preserved; copy
  stamps the current user. The pages list shows "Created by X · Modified by Y".
  Only pages written after this ships carry authorship; older pages show nothing
  until next saved.
