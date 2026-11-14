# Earth Information Jukebox

A Next.js browser experience for NASA Space Apps 2026. Visitors watch an Earth visualization while normalized visual features generate an explainable live score through Web Audio.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Audio starts only after a visitor presses Play.

## NASA precipitation sonification

The default track uses the [NASA Scientific Visualization Studio IMERG animation](https://svs.gsfc.nasa.gov/4285/). Its WebM clip is bundled at `public/media/precipitation.webm`, with 51 timestamped frame-feature samples at `public/data/precipitation.json`. The browser draws a synchronized scan line and generates the sound live from those samples. [Caldwell 73](https://svs.gsfc.nasa.gov/13786/) inspired the scanning presentation and contrasting instrument tones.

Visitors can also choose the existing North Pacific color track at `public/data/ocean.json`, paired with `public/media/ocean.mp4`.

The three feature scores are normalized from sampled animation frames: relative warm-color share, frame-to-frame pixel change, and spatial brightness variation. They are visual features, not calibrated precipitation rates. The animation is a snapshot of NASA's regularly updated visualization as downloaded on November 14, 2026. Credit NASA's Scientific Visualization Studio and animator Horace Mitchell when reusing it.

If the production document is missing, the app falls back to the separately labeled synthetic fixture at `public/fixtures/ocean.synthetic.json`.

The location picker retains latitude and longitude inputs. Visitors can save named circular areas around a selected point in their browser. A selected area is outlined on the globe. Place and area selection do not filter the global feature timeline or change the sound.

## Commands

- `npm run dev` — local development server
- `npm run test` — sampler and contract validation tests
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint
- `npm run build` — production build

## Deploy to Vercel

Import this repository into Vercel and keep the detected Next.js defaults. There are no environment variables, database services, server runtimes, or Python build steps. The required Node version is declared in `package.json`.
