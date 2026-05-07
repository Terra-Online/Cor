# Cor Admin

OEM moderation console for UGC audit.

## Local

```bash
pnpm install
pnpm dev
```

Local server: `http://localhost:5429`

Set `VITE_API_BASE` when Bayes is not running on `http://localhost:8787`.

## Production

Deploy the static build behind Cloudflare Zero Trust at:

```text
https://admin.opendfieldmap.org
```

Zero Trust policy:

- Application domain: `admin.opendfieldmap.org`
- Policy action: Allow
- Include: the administrator identity group used by the OEM team

The UI also verifies the OEM session through Bayes and only allows users with role `admin`. This means Cloudflare Access can protect the admin host, while Bayes still owns moderation permissions.
