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

The location picker retains latitude and longitude inputs. Visitors can save named circular areas around a selected point in their browser. City input resolves coordinates as it changes through FastAPI's `/api/locations` endpoint, using [Open-Meteo's GeoNames-based geocoding service](https://open-meteo.com/en/docs/geocoding-api). Radius changes update the map immediately. The global NASA video tracks contain temporal frame features, so place selection does not change their sound.

For the detailed map, create a [Google Maps JavaScript API key](https://developers.google.com/maps/documentation/javascript/get-api-key), enable Maps JavaScript API, and set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local` before starting Next.js. With a key, Google Maps supports click selection, pan, zoom, and a view masked to the selected radius. Without a key, the existing textured globe remains available.

## Visitor map API

Start the map service separately with `pip install -r server/requirements.txt` and `uvicorn server.main:app --reload --port 8000`. The **Your maps** section accepts GeoJSON Point FeatureCollections and full-world equirectangular PNGs up to 10 MB. The browser filters GeoJSON points by great-circle distance or crops and masks PNG pixels before sending the selected region to FastAPI. Changing the location or radius sends a new filtered selection after the first submission. The server checks that received points and visible PNG pixels lie within the same radius. PNGs are interpreted as spanning 180° W to 180° E and 90° S to 90° N. Set `NEXT_PUBLIC_MAP_API_URL` to the API origin when it differs from `http://localhost:8000`.

The temporary trial controls preview and download the exact cropped PNG sent to FastAPI. After a successful raster submission, the frontend also posts the same multipart fields to `POST /sonfy` on the map API origin. When that route returns an `audio/*` response, an audio player appears below the crop. This repository does not implement `/sonfy`; the page reports its HTTP error until a sound service provides the route.

## Commands

- `npm run dev` — local development server
- `npm run test` — sampler and contract validation tests
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint
- `npm run build` — production build

## Deploy to Vercel

Import the Next.js frontend into Vercel and set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_MAP_API_URL` in the project environment. Deploy the FastAPI service separately and configure its allowed frontend origin before using uploads across domains. The required Node version is declared in `package.json`.
