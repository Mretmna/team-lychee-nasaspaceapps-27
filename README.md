# Team Lychee · Earth Information Jukebox

Team Lychee's project for the 2026 NASA Space Apps Challenge's Earth Information Jukebox challenge. The site pairs Earth visualizations with sound and highlights the five-person team and its Eindhoven local event. See the [official Team Lychee profile](https://www.spaceappschallenge.org/2026/find-a-team/team-lychee/). The interactive dashboard has synchronized live browser audio.

## Repository layout

- `frontend/`: Next.js interface, visualizations, audio engine, tests, and public media/data.
- `backend/`: Python/OpenCV extraction pipeline, provenance documents, and FastAPI map service.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Audio starts when a visitor presses Play. The default track pairs NASA SVS [IMERG imagery](https://svs.gsfc.nasa.gov/4285/) with `frontend/public/media/precipitation.webm` and `frontend/public/data/precipitation.json`. The North Pacific track uses `frontend/public/media/ocean.mp4` and `frontend/public/data/ocean.json`. [Caldwell 73](https://svs.gsfc.nasa.gov/13786/) inspired the scan presentation. Visual features are normalized frame scores, not calibrated precipitation rates or ocean measurements. The synthetic fixture in `frontend/public/fixtures/` is used only if production data is absent.

The location picker supports coordinates, city search, radius selection, and saved areas. Global track sound is not filtered by location. With `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `frontend/.env.local`, the detailed map supports click selection, pan, zoom, and radius masking; without it, the textured globe remains available.

## Map API

From `backend/`, install `server/requirements.txt` and start `uvicorn server.main:app --reload --port 8000` with Python 3.10 or newer. Set `NEXT_PUBLIC_MAP_API_URL` in the frontend if the service is not at `http://localhost:8000`. The map upload accepts GeoJSON Point FeatureCollections and full-world equirectangular PNGs and JPEGs up to 10 MB, filters them to the chosen circular region, and validates the received selection. The trial controls preview and download the crop. Start the separate STRAUSS sound service from `TeamLychee_NasaSpaceApps_Backend` on port 8001 (see its README); set `NEXT_PUBLIC_SONIFY_API_URL` if hosted elsewhere. After raster selection, the frontend sends the cropped PNG to that service's `POST /sonify` and offers a Play generated sound button. A three-way Normal / 3D / 8D control selects the listening style before generation. The rotating region preview has 10, 20, and 30 second duration controls.

If the optional sound service on port 8001 is unavailable, Start still plays the circular visualization for the selected duration and displays a sound warning. The local Next.js config also supports dependencies left at the repository root after moving the app into `frontend/`; a normal install inside `frontend/` remains the preferred setup.

## Checks and deployment

From `frontend/`, run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`. For Vercel, set Root Directory to `frontend` and configure `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_MAP_API_URL` as needed. Deploy the FastAPI service separately and configure its allowed frontend origin.

The offline pipeline in `backend/scripts/` writes final outputs to `frontend/public/`; see `backend/docs/data-methodology.md` for source and reproduction details.

## Circular visualizations

The default-map selector offers Actual World, two animated visualizations, eight detailed still maps from the shared map folder, and the three older low-resolution previews. The detailed maps cover sea currents and temperatures, precipitation and clouds, near-surface temperature, humidity, ozone and wind speed, carbon monoxide, and nitrogen oxides. The two NASA video timelines render only the chosen location and radius, with video frames and a rotating line synchronized to 10, 20, or 30 seconds. Still maps have no timeline frames. Start sends the selected duration and visualization ID to FastAPI on port 8000. Source image resolution ranges from 2048 × 1024 to 8192 × 4096 pixels for the detailed maps; very small radii can still reveal individual source pixels.

## Demo video and tutorial

Set `NEXT_PUBLIC_DEMO_YOUTUBE_URL` in `frontend/.env.local` to a YouTube watch, share, Shorts, or embed URL (or just its 11-character video ID), then restart `npm run dev` or rebuild for production. The welcome page displays a video placeholder until a valid URL is supplied. The full walkthrough is at `/tutorial`, linked near the bottom of the homepage.
