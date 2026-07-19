# Porting Team Access to another GAS build

Everything needed to drop the Media on GAS "Team Access" panel into
another codebase (studio.gasmarketing.co.za or anywhere else).

Each build keeps its **own** user list — Studio's team is separate
from Media's. No shared identity, no SSO. Redis keys can safely
share the same Upstash instance because they're already namespaced
under `user:*` and `usage:*` by client; if you want extra safety,
override the storage key prefix — see the note at the bottom.

## 1. Frontend

Copy this one file into Studio's `src/`:

- `dashboard/src/TeamAccessPanel.jsx`

Then render it wherever you want in Studio (inside your own
Settings modal, on a dedicated `/team` route, whatever):

```jsx
import TeamAccessPanel from "./TeamAccessPanel.jsx";

// somewhere inside your Settings component:
<TeamAccessPanel
  apiBase={STUDIO_API_BASE}   // your API host, e.g. "" for same-origin
  session={sessionToken}      // superadmin session token
  isSuperadmin={isSuperadmin} // hides the panel if false
  // Optional overrides:
  // palette={{ ember: "#your-brand" }}
  // fontFamily='"YourFont",system-ui,sans-serif'
/>
```

The component takes props for `apiBase`, `session`, `isSuperadmin`,
and optionally `palette` / `fontFamily` for re-skin. No React
context, no global state — safe to embed anywhere.

## 2. Backend

Copy these six files verbatim into Studio's `api/` directory:

| File | Purpose |
|---|---|
| `api/users.js` | GET list of team members; POST revoke / restore |
| `api/invite.js` | POST invite (name + email → sends the activation email) |
| `api/accept-invite.js` | POST the invitee follows the emailed link; sets their password |
| `api/admin-reset.js` | POST admin sends a 1h password-reset link |
| `api/_users.js` | Shared data layer (Redis, bcrypt, user CRUD, session helpers) |
| `api/_resetEmail.js` | Reset / invite email templates + text bodies |

And these five dependencies they rely on — check whether Studio
already has them; if it does (most likely for `_rateLimit` and
`auth`), skip; otherwise copy across:

| File | Purpose |
|---|---|
| `api/_rateLimit.js` | Per-IP + per-token rate limiter |
| `api/_rateLimitStore.js` | Redis-backed sliding window for the limiter |
| `api/_audit.js` | Usage-event logger (records team logins, invites, resets) |
| `api/auth.js` | Handles `POST /api/auth` (login) + `GET /api/auth` (session validate). Also exports `getSession` used by the endpoints above. |
| `api/_auth.js` | `checkAuth` helper used by some endpoints |

## 3. npm dependencies

`package.json` needs (if Studio doesn't already):

```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "nodemailer": "^6.9.0"
  }
}
```

## 4. Vercel env vars

Set these on Studio's Vercel project settings → Environment
Variables. If Studio already has `UPSTASH_REDIS_*` for other
features, reuse them:

| Env var | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Redis for user data + sessions + audit log |
| `UPSTASH_REDIS_REST_TOKEN` | ↑ |
| `DASHBOARD_JWT_SECRET` | Signs invite/reset tokens |
| `GMAIL_USER` | Gmail account that sends invite + reset emails |
| `GMAIL_APP_PASSWORD` | Gmail app password for that account |
| `PUBLIC_BASE_URL` | Public URL of Studio (e.g. `https://studio.gasmarketing.co.za`) — the emailed activation / reset links use this as their base |
| `SUPERADMIN_EMAILS` | Comma-separated list of emails that get the "Super Admin" role automatically on first sign-in |

## 5. Routes to register

Both Media and Studio use flat file-based routing on Vercel, so
copying the files into `api/` is enough — no extra routing config.
If Studio uses a different framework:

- `POST /api/users` and `GET /api/users` → `api/users.js`
- `POST /api/invite` → `api/invite.js`
- `POST /api/accept-invite` → `api/accept-invite.js`
- `POST /api/admin-reset` → `api/admin-reset.js`
- `POST /api/auth` (login) and `GET /api/auth` (validate) → `api/auth.js`

Also add a `/signup` SPA rewrite (so the emailed invite link opens
your app shell) — Media's `vercel.json` has:

```json
{ "source": "/signup", "destination": "/index.html" },
{ "source": "/signup/", "destination": "/index.html" },
{ "source": "/signup/:path*", "destination": "/index.html" }
```

Copy those three lines into Studio's `vercel.json` rewrites too.

## 6. First superadmin

On first deploy the endpoints self-bootstrap: whichever email in
`SUPERADMIN_EMAILS` signs in first gets provisioned as superadmin.
See `ensureSuperadminBootstrap` in `api/_users.js`.

Then that superadmin can open the Team Access panel and invite
everyone else.

## Optional: namespace Redis keys

If Media and Studio share the same Upstash instance and you want a
belt-and-braces guarantee the two products' user tables never
collide, do a global find-and-replace in Studio's copies of
`_users.js`, `_audit.js`, `_rateLimitStore.js`:

- `user:` → `studio:user:`
- `session:` → `studio:session:`
- `usage:` → `studio:usage:`
- `ratelimit:` → `studio:ratelimit:`
- `invite:` → `studio:invite:`
- `reset:` → `studio:reset:`

Then Studio and Media each see only their own data even on the same
Redis. Skip this if Studio uses a different Upstash instance.
