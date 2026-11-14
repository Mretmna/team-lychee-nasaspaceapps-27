# Offline data pipeline

This directory is reserved for the Python/OpenCV preparation work: selecting and preparing NASA media, extracting timestamped visual features, and validating the shared JSON contract. The pipeline is not a deployed web service.

Its final outputs belong in `../frontend/public/media/ocean.mp4` and `../frontend/public/data/ocean.json` so the Next.js app can serve them at `/media/ocean.mp4` and `/data/ocean.json`.
