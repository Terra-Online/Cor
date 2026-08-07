# Cor Admin

OEM moderation console for UGC audit.

## Local

```bash
pnpm install
pnpm dev
```

Local server: `http://localhost:5429`

Pages:

- Admin console: `http://localhost:5429/`
- Atlos image report: `http://localhost:5429/report`
- User registration report: `http://localhost:5429/report/users`
- Translation report: `http://localhost:5429/report/translations`

Default API routing:

- Authentication -> `http://localhost:8787/auth/*`
- Moderation and upload data -> `localhost:5429/api/*` -> `http://127.0.0.1:8787/*`
- `https://admin.opendfieldmap.org` -> `https://api.opendfieldmap.org`

`pnpm preview` keeps `/api/*` pointed at `https://api.opendfieldmap.org` so a
production build can be checked against the production API locally.

Local overrides belong in `.env.development.local`; production builds must leave
`VITE_AUTH_API_BASE` and `VITE_DATA_API_BASE` unset so both resolve to
`https://api.opendfieldmap.org` on `admin.opendfieldmap.org`.

## Production

Deploy the SPA to Cloudflare Workers Static Assets and bind it only to:

```text
https://admin.opendfieldmap.org
```

Deploy:

```bash
pnpm build
pnpm exec wrangler deploy
```

Security constraints enforced in `wrangler.toml`:

- `workers_dev = false`
- `preview_urls = false`
- custom domain route: `admin.opendfieldmap.org`

Cloudflare Access policy:

- Application domain: `admin.opendfieldmap.org`
- Policy action: Allow
- Include: the administrator identity group used by the OEM team

The UI also verifies the OEM session through Bayes and only allows users with role `admin`. Cloudflare Access protects the hostname, while Bayes still owns moderation permissions.
