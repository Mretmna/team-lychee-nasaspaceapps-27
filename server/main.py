"""Small FastAPI service for visitor-supplied map images and GeoJSON."""

import json
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

UPLOADS = Path(__file__).resolve().parent / "uploads"
UPLOADS.mkdir(exist_ok=True)
MAX_BYTES = 10 * 1024 * 1024
EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/geo+json": ".geojson", "application/json": ".geojson"}

app = FastAPI(title="Earth Jukebox map API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], allow_methods=["POST"], allow_headers=["*"])
app.mount("/maps", StaticFiles(directory=UPLOADS), name="maps")


@app.post("/api/maps")
async def upload_map(
    file: UploadFile = File(...),
    area_name: str = Form(...),
    city: str = Form(""),
    country: str = Form(""),
    latitude: float = Form(...),
    longitude: float = Form(...),
    radius_km: float | None = Form(None),
):
    if not area_name.strip() or len(area_name) > 80 or len(city) > 80 or len(country) > 80 or not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or (radius_km is not None and not 10 <= radius_km <= 10000):
        raise HTTPException(422, "The selected area has invalid coordinates or radius.")
    suffix = EXTENSIONS.get(file.content_type or "")
    if not suffix and file.filename and file.filename.lower().endswith(".geojson") and file.content_type in {None, "application/octet-stream"}:
        suffix = ".geojson"
    if not suffix:
        raise HTTPException(415, "Upload a PNG, JPEG, WebP, or GeoJSON map.")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Map files must be 10 MB or smaller.")
    if suffix == ".geojson":
        try:
            document = json.loads(data)
            if document.get("type") not in {"FeatureCollection", "Feature", "GeometryCollection", "Polygon", "MultiPolygon"}:
                raise ValueError("Unsupported GeoJSON type")
        except (ValueError, AttributeError, UnicodeDecodeError):
            raise HTTPException(422, "The file is not valid map GeoJSON.") from None
    elif not (data.startswith(b"\x89PNG\r\n\x1a\n") if suffix == ".png" else data.startswith(b"\xff\xd8\xff") if suffix == ".jpg" else data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        raise HTTPException(422, "The image content does not match its file type.")
    map_id = uuid4().hex
    (UPLOADS / f"{map_id}{suffix}").write_bytes(data)
    result = {"id": map_id, "name": file.filename, "kind": "geojson" if suffix == ".geojson" else "image", "url": f"/maps/{map_id}{suffix}", "area": {"name": area_name.strip(), "city": city.strip(), "country": country.strip(), "latitude": latitude, "longitude": longitude, "radiusKm": radius_km}}
    (UPLOADS / f"{map_id}.json").write_text(json.dumps(result), encoding="utf-8")
    return result
