# Deployment

The site deploys to [Vercel](https://vercel.com) as a static build, served at **https://dsa.muscodes.com**. The domain's DNS is on Cloudflare.

## How it works

- Vercel runs `npm run build` and serves `dist/`. The settings are in `vercel.json`: the framework, clean URLs with trailing slashes, the security headers, and long-term caching for hashed assets.
- Every push to `main` deploys to production. Every pull request gets its own preview URL.
- `VITE_SITE_URL` in `.env` is the public address. It fills in the canonical and Open Graph links and the sitemap.

## First-time setup

1. **Import the project.** In Vercel, choose **Add New… → Project**, then import `muneebexotic/3d-dsa`. Vercel detects Vite and reads `vercel.json`, so leave the build settings as they are. Deploy.
2. **Add the domain.** Open the project's **Settings → Domains** and add `dsa.muscodes.com`. Vercel shows the DNS record it expects.
3. **Point DNS at Vercel.** In Cloudflare, open `muscodes.com` → **DNS → Records** and add:

   | Type  | Name  | Target                 | Proxy status          |
   | ----- | ----- | ---------------------- | --------------------- |
   | CNAME | `dsa` | `cname.vercel-dns.com` | DNS only (grey cloud) |

   Use DNS only, the same as the other subdomains on Vercel, so that Vercel can issue the HTTPS certificate. Vercel marks the domain as valid within a few minutes.

## Changing the address

To serve the site somewhere else, change `VITE_SITE_URL` in `.env` (for example `https://algorithms.muscodes.com`), add that domain in Vercel, and add the matching CNAME in Cloudflare. To override it without a commit, set `VITE_SITE_URL` under the Vercel project's **Settings → Environment Variables**; that takes precedence over `.env`.

## Checking a build locally

```
npm run build
npm run preview
```

`vite preview` serves `dist/` with the same headers as production, at http://localhost:4173/.
