# OpenEyes

**OpenEyes - Nothing stays hidden**

OpenEyes is a black-and-white intelligence workspace built from the supplied 67.zip structure. It keeps the modular workspace philosophy while adding account authentication, server-side quotas, account history, an OSINT Map, role-aware administration, owner keys and a synthetic test dataset.

## Start (Windows / PowerShell)

Use Node.js 22.5 or newer. In PowerShell, open this project folder and run:

```powershell
npm install
npm run dev
```

Open `http://localhost:5180`. The development launcher starts the API and Vite directly through Node, so Windows paths containing spaces (for example `C:\Program Files`) are handled without shell splitting. Existing `server/api.env` is preserved; the launcher only creates it from `server/api.env.example` if it does not exist.

The frontend uses Vite. For the API:

```bash
cd server
cp .env.example .env
# Set SESSION_SECRET and OWNER_USERNAME / OWNER_PASSWORD.
npm install
npm run dev
```

For a production-style static build:

```bash
npm run build
```

Then set `STATIC_DIR=../dist` in the server environment.

## Roles and limits

- Owner: unlimited
- Admin: 200/day
- Lifetime: 70/day
- Premium: 35/day
- Media: 15/day
- Starter: 15/day
- Free: 5/day

Limits are enforced server-side.

## Plans

- Free — 5 searches/day
- Starter — €4.99 — 15 searches/day
- Premium — €9.99 — 35 searches/day
- Lifetime — €39.99 — 70 searches/day
- Media — 15 searches/day
- Admin — 200 searches/day
- Owner — Unlimited

Starter, Premium and Lifetime use the configurable Discord shop destination. No fake payment processor is implemented.

## Security

Passwords are stored using salted scrypt hashes. Sessions use HTTP-only cookies, server-side session invalidation, CSRF checks, rate limiting and input validation. A new login invalidates the account's previous active session.

## Synthetic test object

`test@example.com` is explicitly synthetic and returns only `.invalid` domains, synthetic passwords and test usernames. It is never presented as real breach data.


### Profile & API configuration
- Edit your profile in Settings: name, avatar, email, occupation, gender and password.
- `server/.env` accepts `DATABASE_API_URL` and `DATABASE_API_TOKEN` for your own database API.
- `server/api.env` contains per-tool `API_<TOOL>_URL` / `API_<TOOL>_KEY` values.
- External provider responses are normalized server-side and credential-like fields such as passwords, tokens and private keys are redacted.

## Database API enrichment

Set `DATABASE_API_URL` and optionally `DATABASE_API_TOKEN` in the server environment.
Every `/api/run/:moduleId` search calls this API in addition to the module's normal
lookup source. The response is shown in a `Database API` result block. Credential-like
fields (passwords, tokens, secrets, cookies, session values, private keys and
authorization values) are intentionally excluded from the UI and exported result.
Database API failure does not hide an otherwise successful module lookup.
