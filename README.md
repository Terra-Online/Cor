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
- Direct submission review: `http://localhost:5429/?submissionId=<submission-id>` (images and comments, independent of the queue's date range and current status)
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

## Version-bound management

The inspector shows the latest submitted version (frontier), the currently public
version, review status, deletion facts and retained flags separately. Review and
disable bind the clicked frontier. Clear flags binds the returned report target,
which can be an earlier public version. Hidden and terminal content has no restore
action. Retained reports covers both comments and images across all dates, in
100-row pages; actions reset the list to its first page.

Bulk actions are independent requests. The UI waits for every outcome, refreshes
once and reports committed, unchanged, conflicted and failed requests. A conflict
requires inspecting the refreshed row and clicking again. A validation error is
shown as a contract mismatch; commands never fall back to legacy status payloads.

Local checks (no backend or browser required):

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
```

Vitest and jsdom mount the actual React pages and use the real HTTP client with an
isolated fetch transport. The optional Bayes `scripts/vitest.cor.config.ts` suite
loads this checkout via `COR_REPO_ROOT` and exercises the real authenticated
moderation routes and new-model test database. These checks do not contact a live
admin service or validate deployed Cloudflare Access/cookie configuration.
