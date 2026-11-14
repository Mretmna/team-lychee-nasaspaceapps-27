# Challenge resource review — 2026-11-14

The supplied official resources URL could not be retrieved by the web tool:
https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/?tab=resources

Resource links were discovered through the local-event reproduction at https://hackathlone.com/challenges/the-earth-information-jukebox and then checked on NASA SVS itself. This is not verification that the reproduction matches every current official resource.

## Downloaded candidate: SVS 3912

Source: https://svs.gsfc.nasa.gov/3912/
Title: Global Sea Surface Currents and Temperature.
NASA describes ECCO2 model surface flows colored by temperature, covering March 2007–March 2008.
Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio.
Preview: https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/ecco2_sst_flow.m4v
Metadata: https://svs.gsfc.nasa.gov/api/3912/

The metadata and movie were downloaded to ignored `.cache-data/`. Local inspection measured 640×320, 30 fps, 66.7 seconds, 12,670,193 bytes. SHA-256 and six review timestamps are in `ecco2-preview.json`; the contact sheet is `ecco2-preview.jpg`. The sampled frames show a fixed world map with changing particle patterns and no visible text overlays. This is a promising second track, not a validated production replacement. Low-resolution preview compression can obscure fine flow detail.

Reproduce inspection after downloading the preview:

```sh
.venv-data/bin/python scripts/inspect_resource.py .cache-data/ecco2_sst_flow.m4v --output-prefix docs/resources/ecco2-preview
```

Implementation recommendation: use a reviewed fixed ocean polygon or external binary mask. Do NOT reuse the current all-samples brightness/chroma intersection mask: moving trails and dark water would bias spatial support. Test the existing fixed motion gain for saturation before adoption. Keep warmth and motion labeled visual proxies; these features do not recover temperature or current speed. A candidate track needs explicit source/credits configuration before using the extractor, which currently hard-codes SVS 5101 provenance. Preserve the existing production ocean track until that work is validated.

## Deferred candidate: SVS 5425

https://svs.gsfc.nasa.gov/5425/ — Perpetual Ocean 2: Western Boundary Currents.
NASA provides separate beauty, temperature, and salinity versions. The beauty version's colors are aesthetic; they are not temperature colors. Its globe rotates and camera zooms/moves, so frame differences mix camera movement with ocean animation. Prefer a reviewed stationary interval in the temperature version if pursuing it. Large source downloads and camera handling make it less convenient for the first extension. No video downloaded for this candidate.

## Existing track

SVS 5101 remains the validated production asset. The linked EIC collection is https://svs.gsfc.nasa.gov/gallery/earth-information-center/ . Current track assets and their JSON contract are unchanged. These candidate inputs are visualizations, not downloaded raw numerical ocean measurements. Raw model-data ingestion would be a separate pipeline with units, time alignment, and geographical validation.
