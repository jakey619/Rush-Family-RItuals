# Rush Family Rituals

Offline-first family routine tracker built with React and Vite. The app works in local-only mode by default and enables Supabase sync when the required environment variables are present.

## Requirements

- Node.js 20+
- npm 10+

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with the values below if you want cloud sync:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_FAMILY_ID=rush-family
```

If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing, the app still runs in local-only mode and stores data in the browser.

3. Start the app:

```bash
npm run dev
```

## Build

Create a production bundle with:

```bash
npm run build
```

Preview the production build locally with:

```bash
npm run preview
```

## Versioning

This project now uses semantic versioning, with `package.json` as the single source of truth for the app version. The running UI shows that same version so deployed builds are easy to identify.

Release history is tracked in `CHANGELOG.md`, and each released version should also get a matching git tag so the codebase can be restored to that exact point later.

Use these commands when you ship changes:

```bash
npm run version:show
npm run version:patch
npm run version:minor
npm run version:major
```

- `patch`: bug fixes, wording tweaks, styling adjustments, small non-breaking changes
- `minor`: new features or meaningful non-breaking behavior changes
- `major`: breaking changes, data model shifts, or anything requiring coordinated rollout

Recommended release flow:

```bash
npm run version:minor
git add CHANGELOG.md package.json package-lock.json
git commit -m "Release v0.2.0"
git tag -a v0.2.0 -m "Release v0.2.0"
```

## Deploy

Any static host that can serve a Vite build will work, including Vercel, Netlify, GitHub Pages, Cloudflare Pages, or an S3-style static site.

- Build output is written to `dist/`
- If you want synced data in production, set the same `VITE_SUPABASE_*` variables in your hosting provider
- The service worker is served from `public/sw.js`

## Notes

- Routine data and pending offline changes are stored with `localforage`
- Supabase is optional; missing config no longer breaks the app at startup
