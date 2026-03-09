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

## Deploy

Any static host that can serve a Vite build will work, including Vercel, Netlify, GitHub Pages, Cloudflare Pages, or an S3-style static site.

- Build output is written to `dist/`
- If you want synced data in production, set the same `VITE_SUPABASE_*` variables in your hosting provider
- The service worker is served from `public/sw.js`

## Notes

- Routine data and pending offline changes are stored with `localforage`
- Supabase is optional; missing config no longer breaks the app at startup
