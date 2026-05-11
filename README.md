# Cor Admin

OEM moderation console for UGC audit.

## Local

```bash
pnpm install
pnpm dev
```

Local server: `http://localhost:5429`

Default routing:

- `localhost` / `127.0.0.1` admin UI -> `http://localhost:8787`
- `https://admin.opendfieldmap.org` -> `https://api.opendfieldmap.org`

Set `VITE_API_BASE` only for nonstandard environments.

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
