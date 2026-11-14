# Earth Information Jukebox

A Next.js browser experience for NASA Space Apps 2026. Visitors watch an Earth visualization while normalized visual features generate an explainable live score through Web Audio.

## Repository layout

- `frontend/` contains the Next.js interface, browser audio engine, tests, and public assets.
- `backend/` is reserved for the offline Python/OpenCV media and feature extraction pipeline. The browser app does not require a running backend service.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Audio starts only after a visitor presses Play.

## Data integration

The app first requests the production track document at `frontend/public/data/ocean.json`. When that file is absent, it deliberately falls back to `frontend/public/fixtures/ocean.synthetic.json` and labels the entire experience as a synthetic preview. The fixture does not overwrite or impersonate NASA data.

To integrate the offline data pipeline:

1. Place the final browser-compatible clip at `frontend/public/media/ocean.mp4`.
2. Place the validated shared-contract document at `frontend/public/data/ocean.json` with `videoUrl` set to `/media/ocean.mp4`.
3. From `frontend/`, run `npm run test && npm run build`.

The location picker currently marks a visitor-selected point for exploration. It does **not** filter the global feature timeline or change the sound; the interface states that limitation directly.

## Commands

- `npm run dev` — local development server
- `npm run test` — sampler and contract validation tests
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint
- `npm run build` — production build

## Deploy to Vercel

Import this repository into Vercel, set the Root Directory to `frontend`, and keep the Next.js defaults. There are no environment variables, database services, server runtimes, or Python build steps. The required Node version is declared in `frontend/package.json`. Deployment should happen after the real `frontend/public/data/ocean.json` and `frontend/public/media/ocean.mp4` are committed, unless a labeled preview deployment is intended.
