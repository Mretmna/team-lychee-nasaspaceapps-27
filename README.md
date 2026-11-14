# Earth Information Jukebox

NASA Space Apps dashboard with synchronized live browser audio.

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

From `backend/`, install `server/requirements.txt` and start `uvicorn server.main:app --reload --port 8000`. Set `NEXT_PUBLIC_MAP_API_URL` in the frontend if the service is not at `http://localhost:8000`. The map upload accepts GeoJSON Point FeatureCollections and full-world equirectangular PNGs up to 10 MB, filters them to the chosen circular region, and validates the received selection. The trial controls preview and download the crop. After a successful raster submission, the frontend also calls `POST /sonfy`; that sound route is not implemented here, so its HTTP error is shown until a sound service is connected. The rotating region preview has 10, 20, and 30 second duration controls.

## Checks and deployment

From `frontend/`, run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`. For Vercel, set Root Directory to `frontend` and configure `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_MAP_API_URL` as needed. Deploy the FastAPI service separately and configure its allowed frontend origin.

The offline pipeline in `backend/scripts/` writes final outputs to `frontend/public/`; see `backend/docs/data-methodology.md` for source and reproduction details.
