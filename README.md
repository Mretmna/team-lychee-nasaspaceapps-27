# Earth Information Jukebox

A Next.js browser experience for NASA Space Apps 2026. Visitors watch an Earth visualization while normalized visual features generate an explainable live score through Web Audio.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Audio starts only after a visitor presses Play.

## Data integration

The app first requests the production track document at `public/data/ocean.json`. When that file is absent, it deliberately falls back to `public/fixtures/ocean.synthetic.json` and labels the entire experience as a synthetic preview. The fixture does not overwrite or impersonate NASA data.

To integrate the offline data pipeline:

1. Place the final browser-compatible clip at `public/media/ocean.mp4`.
2. Place the validated shared-contract document at `public/data/ocean.json` with `videoUrl` set to `/media/ocean.mp4`.
3. Run `npm run test && npm run build`.

The location picker currently marks a visitor-selected point for exploration. It does **not** filter the global feature timeline or change the sound; the interface states that limitation directly.

## Commands

- `npm run dev` — local development server
- `npm run test` — sampler and contract validation tests
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint
- `npm run build` — production build

## Deploy to Vercel

Import this repository into Vercel and keep the detected Next.js defaults. There are no environment variables, database services, server runtimes, or Python build steps. The required Node version is declared in `package.json`. Deployment should happen after the real `public/data/ocean.json` and `public/media/ocean.mp4` are committed, unless a labeled preview deployment is intended.
