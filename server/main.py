"""Small FastAPI service for visitor-supplied map images and GeoJSON."""

import json
import io
import math
import os
import unicodedata
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from uuid import uuid4
from asyncio import to_thread

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError

UPLOADS = Path(__file__).resolve().parent / "uploads"
UPLOADS.mkdir(exist_ok=True)
MAX_BYTES = 10 * 1024 * 1024
EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/geo+json": ".geojson", "application/json": ".geojson"}

app = FastAPI(title="Earth Jukebox map API")
app.add_middleware(CORSMiddleware, allow_origins=[origin.strip() for origin in os.getenv("MAP_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")], allow_methods=["GET", "POST"], allow_headers=["*"])
app.mount("/maps", StaticFiles(directory=UPLOADS), name="maps")


def normalized(value: str) -> str:
    return "".join(character for character in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(character))


class PointGeometry(BaseModel):
    type: str
    coordinates: tuple[float, float]


class PointFeature(BaseModel):
    type: str
    geometry: PointGeometry


class PointCollection(BaseModel):
    type: str
    features: list[PointFeature] = Field(max_length=10000)


class AreaSelection(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    radiusKm: float = Field(ge=10, le=10000, allow_inf_nan=False)
    data: PointCollection


def distance_km(latitude: float, longitude: float, other_latitude: float, other_longitude: float) -> float:
    latitude1, latitude2 = math.radians(latitude), math.radians(other_latitude)
    delta_latitude = math.radians(other_latitude - latitude)
    delta_longitude = math.radians(other_longitude - longitude)
    arc = math.sin(delta_latitude / 2) ** 2 + math.cos(latitude1) * math.cos(latitude2) * math.sin(delta_longitude / 2) ** 2
    return 6371.0088 * 2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc))


@app.post("/api/selection")
async def process_selection(selection: AreaSelection):
    if selection.data.type != "FeatureCollection":
        raise HTTPException(422, "Expected a GeoJSON FeatureCollection.")
    for feature in selection.data.features:
        if feature.type != "Feature" or feature.geometry.type != "Point":
            raise HTTPException(422, "Only point features are supported.")
        longitude, latitude = feature.geometry.coordinates
        if not math.isfinite(latitude) or not math.isfinite(longitude) or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise HTTPException(422, "A point has invalid coordinates.")
        if distance_km(selection.latitude, selection.longitude, latitude, longitude) > selection.radiusKm + 0.001:
            raise HTTPException(422, "A point lies outside the selected radius.")
    return {"latitude": selection.latitude, "longitude": selection.longitude, "radiusKm": selection.radiusKm, "receivedPoints": len(selection.data.features)}


@app.post("/api/raster-selection")
async def process_raster_selection(
    file: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    radius_km: float = Form(...),
    west: float = Form(...),
    east: float = Form(...),
    south: float = Form(...),
    north: float = Form(...),
):
    values = (latitude, longitude, radius_km, west, east, south, north)
    if not all(math.isfinite(value) for value in values) or not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or not 10 <= radius_km <= 10000:
        raise HTTPException(422, "Invalid selected center or radius.")
    if not -90 <= south < north <= 90 or not 0 < east - west <= 360 or not west <= longitude <= east or not south <= latitude <= north:
        raise HTTPException(422, "Invalid geographic bounds.")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(422, "Send a cropped PNG smaller than 10 MB.")
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.width > 1024 or source.height > 1024 or source.width < 1 or source.height < 1:
                raise HTTPException(422, "The cropped image dimensions are invalid.")
            image = source.convert("RGBA")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(422, "The cropped PNG could not be read.") from None
    width, height = image.size
    covered = 0
    for index, (_, _, _, alpha) in enumerate(image.getdata()):
        if alpha == 0:
            continue
        x, y = index % width, index // width
        pixel_latitude = north - ((y + 0.5) / height) * (north - south)
        pixel_longitude = west + ((x + 0.5) / width) * (east - west)
        if distance_km(latitude, longitude, pixel_latitude, pixel_longitude) > radius_km + 1:
            raise HTTPException(422, "The PNG contains pixels outside the selected radius.")
        covered += 1
    return {"latitude": latitude, "longitude": longitude, "radiusKm": radius_km, "width": width, "height": height, "coveredPixels": covered}


@app.get("/api/locations")
async def locate_city(city: str = Query(min_length=2, max_length=80), country: str = Query(default="", max_length=80)):
    query = urlencode({"name": city.strip(), "count": 20, "language": "en", "format": "json"})

    def fetch_locations():
        with urlopen(f"https://geocoding-api.open-meteo.com/v1/search?{query}", timeout=8) as response:
            return json.load(response).get("results", [])

    try:
        results = await to_thread(fetch_locations)
    except Exception:
        raise HTTPException(502, "City lookup is temporarily unavailable.") from None

    country_query = normalized(country.strip())
    if country_query:
        country_code = "tr" if country_query in {"turkey", "turkiye", "republic of turkiye"} else country_query
        results = [item for item in results if country_code == normalized(item.get("country_code", "")) or country_query in normalized(item.get("country", ""))]
    city_query = normalized(city.strip())
    results = [item for item in results if normalized(item.get("name", "")) == city_query] or results
    if not results:
        raise HTTPException(404, "City not found. Check the city and country names.")
    place = results[0]
    return {"city": place["name"], "country": place["country"], "latitude": place["latitude"], "longitude": place["longitude"], "region": place.get("admin1", "")}


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
