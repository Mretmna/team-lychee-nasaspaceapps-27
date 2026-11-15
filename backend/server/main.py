"""Small FastAPI service for visitor-supplied map images and GeoJSON."""

import json
import io
import math
import os
import re
import struct
import unicodedata
import wave
from typing import Literal
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from uuid import uuid4
from asyncio import to_thread

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from google.cloud import storage
from google.api_core.exceptions import NotFound
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError

UPLOAD_BUCKET = os.getenv("MAP_UPLOAD_BUCKET", "").strip()
UPLOADS = Path(__file__).resolve().parent / "uploads"
if not UPLOAD_BUCKET:
    UPLOADS.mkdir(exist_ok=True)
MAX_BYTES = 10 * 1024 * 1024
EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/geo+json": ".geojson", "application/json": ".geojson"}

app = FastAPI(title="Earth Jukebox map API")
app.add_middleware(CORSMiddleware, allow_origins=[origin.strip() for origin in os.getenv("MAP_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.82:3000").split(",")], allow_methods=["GET", "POST"], allow_headers=["*"])
if not UPLOAD_BUCKET:
    app.mount("/maps", StaticFiles(directory=UPLOADS), name="maps")


@app.get("/maps/{map_name}")
async def get_uploaded_map(map_name: str):
    if not UPLOAD_BUCKET or not re.fullmatch(r"[0-9a-f]{32}\.(?:png|jpg|webp|geojson)", map_name):
        raise HTTPException(404, "Map not found.")
    try:
        data = await to_thread(storage.Client().bucket(UPLOAD_BUCKET).blob(map_name).download_as_bytes)
    except NotFound:
        raise HTTPException(404, "Map not found.") from None
    media_type = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".geojson": "application/geo+json"}[Path(map_name).suffix]
    return Response(data, media_type=media_type)


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
    regionShape: Literal["circle", "square", "full"] = "circle"
    data: PointCollection


def distance_km(latitude: float, longitude: float, other_latitude: float, other_longitude: float) -> float:
    latitude1, latitude2 = math.radians(latitude), math.radians(other_latitude)
    delta_latitude = math.radians(other_latitude - latitude)
    delta_longitude = math.radians(other_longitude - longitude)
    arc = math.sin(delta_latitude / 2) ** 2 + math.cos(latitude1) * math.cos(latitude2) * math.sin(delta_longitude / 2) ** 2
    return 6371.0088 * 2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc))


def square_bounds(latitude: float, longitude: float, radius_km: float):
    angular_radius = radius_km / 6371.0088
    latitude_span = math.degrees(angular_radius)
    north = min(90, latitude + latitude_span)
    south = max(-90, latitude - latitude_span)
    longitude_span = 180 if north == 90 or south == -90 else math.degrees(math.asin(min(1, math.sin(angular_radius) / math.cos(math.radians(latitude)))))
    return longitude - longitude_span, longitude + longitude_span, south, north


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
        if selection.regionShape == "circle" and distance_km(selection.latitude, selection.longitude, latitude, longitude) > selection.radiusKm + 0.001:
            raise HTTPException(422, "A point lies outside the selected circle.")
        if selection.regionShape == "square":
            west, east, south, north = square_bounds(selection.latitude, selection.longitude, selection.radiusKm)
            unwrapped_longitude = selection.longitude + (longitude - selection.longitude + 180) % 360 - 180
            if not south <= latitude <= north or not west <= unwrapped_longitude <= east:
                raise HTTPException(422, "A point lies outside the selected square.")
    return {"latitude": selection.latitude, "longitude": selection.longitude, "radiusKm": selection.radiusKm, "regionShape": selection.regionShape, "receivedPoints": len(selection.data.features)}


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
    duration_seconds: int | None = Form(None),
    visualization_id: str | None = Form(None),
    region_shape: Literal["circle", "square", "full"] = Form("circle"),
):
    if duration_seconds is not None and duration_seconds not in (10, 20, 30):
        raise HTTPException(422, "Duration must be 10, 20, or 30 seconds.")
    if visualization_id is not None and visualization_id not in {
        "actual", "precipitation", "ocean", "map1", "map2", "map3",
        "seaCurrents", "precipitationClouds", "surfaceTemperature", "surfaceHumidity",
        "surfaceOzone", "surfaceWindSpeed", "carbonMonoxide", "nitrogenOxides",
    }:
        raise HTTPException(422, "Unknown visualization.")
    values = (latitude, longitude, radius_km, west, east, south, north)
    if not all(math.isfinite(value) for value in values) or not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or not 10 <= radius_km <= 10000:
        raise HTTPException(422, "Invalid selected center or radius.")
    if not -90 <= south < north <= 90 or not 0 < east - west <= 360 or not west <= longitude <= east or not south <= latitude <= north:
        raise HTTPException(422, "Invalid geographic bounds.")
    if region_shape == "full" and (west, east, south, north) != (-180, 180, -90, 90):
        raise HTTPException(422, "Whole-map mode requires world bounds.")
    if region_shape == "square" and any(abs(actual - expected) > 0.001 for actual, expected in zip((west, east, south, north), square_bounds(latitude, longitude, radius_km))):
        raise HTTPException(422, "Square bounds do not match the selected center and radius.")
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
        if region_shape == "circle" and distance_km(latitude, longitude, pixel_latitude, pixel_longitude) > radius_km + 1:
            raise HTTPException(422, "The PNG contains pixels outside the selected radius.")
        covered += 1
    return {"latitude": latitude, "longitude": longitude, "radiusKm": radius_km, "regionShape": region_shape, "width": width, "height": height, "coveredPixels": covered, "durationSeconds": duration_seconds, "visualizationId": visualization_id}


@app.post("/sonify")
async def sonify_raster(
    file: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    radius_km: float = Form(...),
    west: float = Form(...),
    east: float = Form(...),
    south: float = Form(...),
    north: float = Form(...),
    region_shape: Literal["circle", "square", "full"] = Form("circle"),
):
    """Turn the submitted visual crop into a bounded, deterministic WAV preview."""
    await process_raster_selection(file, latitude, longitude, radius_km, west, east, south, north, None, None, region_shape)
    await file.seek(0)
    data = await file.read(MAX_BYTES + 1)
    with Image.open(io.BytesIO(data)) as source:
        image = source.convert("RGBA")
    image.thumbnail((96, 96))

    # Each vertical slice supplies a note; transparent pixels never contribute.
    segments = 32
    notes: list[tuple[float, float]] = []
    for segment in range(segments):
        left = segment * image.width // segments
        right = max(left + 1, (segment + 1) * image.width // segments)
        pixels = [image.getpixel((x, y)) for x in range(left, min(right, image.width)) for y in range(image.height)]
        visible = [(red, green, blue) for red, green, blue, alpha in pixels if alpha > 0]
        if not visible:
            notes.append((0.0, 0.0))
            continue
        warmth = sum((red - blue + 255) / 510 for red, _, blue in visible) / len(visible)
        brightness = sum((red + green + blue) / 765 for red, green, blue in visible) / len(visible)
        scale = (0, 2, 4, 7, 9, 12, 14, 16)
        semitone = scale[min(len(scale) - 1, int(warmth * len(scale)))]
        notes.append((220 * 2 ** (semitone / 12), min(0.18, 0.06 + brightness * 0.12)))

    sample_rate = 22050
    seconds = 8
    samples_per_note = sample_rate * seconds // segments
    pcm = bytearray()
    for index, (frequency, amplitude) in enumerate(notes):
        for sample in range(samples_per_note):
            envelope = min(1.0, sample / 180) * min(1.0, (samples_per_note - sample) / 900)
            phase = 2 * math.pi * frequency * sample / sample_rate
            tone = math.sin(phase) + 0.18 * math.sin(2 * phase)
            pcm.extend(struct.pack("<h", int(32767 * amplitude * envelope * tone / 1.18)))
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return Response(output.getvalue(), media_type="audio/wav", headers={"Content-Disposition": 'inline; filename="selected-area.wav"'})


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
    result = {"id": map_id, "name": file.filename, "kind": "geojson" if suffix == ".geojson" else "image", "url": f"/maps/{map_id}{suffix}", "area": {"name": area_name.strip(), "city": city.strip(), "country": country.strip(), "latitude": latitude, "longitude": longitude, "radiusKm": radius_km}}
    if UPLOAD_BUCKET:
        bucket = storage.Client().bucket(UPLOAD_BUCKET)
        await to_thread(bucket.blob(f"{map_id}{suffix}").upload_from_string, data, content_type=file.content_type)
        await to_thread(bucket.blob(f"{map_id}.json").upload_from_string, json.dumps(result), content_type="application/json")
    else:
        (UPLOADS / f"{map_id}{suffix}").write_bytes(data)
        (UPLOADS / f"{map_id}.json").write_text(json.dumps(result), encoding="utf-8")
    return result
