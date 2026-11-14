# Ocean data package

This package supplies `public/media/ocean.mp4` and `public/data/ocean.json` to the web workstream without changing its version-1 contract. There is no server, soundtrack, JavaScript dependency, or deployment-time preprocessing.

## Source and selection

Source: [NASA SVS 5101 — Sea Surface Temperature (SST), Near Real Time](https://svs.gsfc.nasa.gov/5101/). Its page explicitly tags Earth Information Center and provides a no-datestamp equirectangular movie. It depicts JPL MUR SST analysis. The fixed projection avoids camera motion; seasonal colors and spatial gradients support understandable changing sound. We analyze a fixed North Pacific region, not the entire world, to avoid cancellation between northern and southern seasons. The UI should explain this region to listeners.

Credit: NASA's Scientific Visualization Studio. Visualizers: Kel Elkins (USRA), Greg Shirah (NASA/GSFC). Technical support: Laurence Schuler and Ian Jones (ADNET Systems, Inc.). Underlying data: JPL MUR SST analysis, [dataset](https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1).

[SVS usage guidance](https://svs.gsfc.nasa.gov/help/) permits redistribution unless otherwise noted; no separate restriction was identified on this item's page. Audio is explicitly removed. Source download URL, content hashes, encoding command, and source interval are recorded in `ocean-provenance.json`. The source URL is updated by NASA: a future download may differ. Preserve the supplied final MP4 as the immutable extraction input; hashes identify this snapshot. The original is only in ignored `.cache-data/`, outside the deployed bundle.

## Challenge verification (2026-11-14)

The [official challenge](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/) search listing and official team pages describe pairing EIC frames with real-time sonification. Direct retrieval of the complete challenge/resources page failed (502). The [November 12 navigator answer](https://github.com/nasa/spaceapps/discussions/1844) says visual-frame and associated raw-data approaches can both be relevant, while directing teams to official requirements. This implementation directly analyzes EIC frames. Full current eligibility and resource-specific conditions remain unverified; this document is not an eligibility ruling.

## Reproduce from the included final clip

Run from the repository root with Python 3.11–3.14 (tested with 3.14 on macOS ARM64):

```sh
python3 -m venv .venv-data
.venv-data/bin/python -m pip install -r requirements-data.txt
.venv-data/bin/python scripts/extract_features.py --input public/media/ocean.mp4 --output public/data/ocean.json --report docs/ocean-validation.json --mask-output docs/ocean-mask.png
```

The last line is the one extraction command. It fully decodes the final video and writes deterministic rounded values. Decoder differences across platforms may cause small numerical differences; recorded validation uses the pinned packages. Dependencies are offline development tools, excluded via `.vercelignore`.

To regenerate the video (network required):

```sh
mkdir -p .cache-data
curl -fL --retry 3 'https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005101/sst_30_sec_no-dates_4096x2048_2x1_30p.mp4' -o .cache-data/source.mp4
.venv-data/bin/python scripts/prepare_ocean.py
```

Check the original source hash against the recorded provenance before preparing if exact snapshot reproduction is required. Preparation overwrites the final video and provenance, so retain a copy if NASA has updated the source. It selects source seconds `[0,30)` at unchanged speed, scales with Lanczos to 1280×640, forces 30 fps and square pixels, and encodes H.264 Main level 3.1, CRF 23, yuv420p, fast-start MP4. No crop or sound is added to the displayed video. FFmpeg is supplied by pinned `imageio-ffmpeg`; its actual version is recorded. Full browser playback still needs testing in the target devices; compatible encoding alone is not a browser test.

## Mask and definitions

All calculations use decoded, gamma-encoded RGB byte values divided by 255, without linear-light conversion or scientific palette inversion. The final-resolution half-open ROI is x `[floor(.03W),floor(.14W))`, y `[floor(.28H),floor(.44H))`. For this equirectangular map this is approximately 169.2°W–129.6°W and 39.6°N–10.8°N. The coordinate bounds are image-space approximations, not a geospatial scientific mask.

The region omits captions, legends, edges, polar backgrounds and large continents. Within it, pixels are retained only if their maximum RGB channel exceeds 0.20 and either their RGB channel range (max minus min) exceeds 0.06 or their minimum channel exceeds 0.60 (preserving pale ocean colors) in **every sampled frame**; the resulting fixed mask is eroded with a 3×3 square, with zero border, to exclude dark or neutral-gray islands and their immediate compression halo. This is a visual brightness/chroma heuristic, not an authoritative land mask. It can omit dark or near-neutral ocean pixels and leave mixed coastal pixels. `ocean-mask.png` is the ROI-sized retained-pixel mask (white means used). All three features and every time sample use exactly this same spatial support; no per-frame mask changes or resizing occur.

For retained pixels, with R,G,B in [0,1]:

- `colorWarmth = mean((R − B + 1)/2)`. Blue has 0, red 1, and neutral gray 0.5. Fixed theoretical bounds, no per-clip stretching. This is a warm-color score, **not measured temperature**.
- `motion = clip(mean(abs(RGB(t) − RGB(previous sample))) / 0.05, 0, 1)`. The mean covers pixels and all three channels. A mean change of 5% of full channel range saturates at 1. The fixed gain makes subtle visual changes usable; it is not fitted by per-clip minimum/maximum. Comparisons span 0.2 seconds of playback, not consecutive 30 fps frames. The first value is 0 by convention because no previous sample exists. This is visual change, **not current speed**, optical flow, or physical velocity.
- `variation = 2 × sqrt(mean(var(R), var(G), var(B)))`, using population variance over the mask. Each channel's theoretical maximum variance is 0.25, so output lies in [0,1]; floating-point roundoff is clipped defensively. Uniform color gives zero; color mixtures give larger values. This measures spatial color diversity, not climate variability.

None divide by an observed range, so constant inputs are well-defined. Empty masks, nonfinite pixels and undecodable inputs fail instead of becoming zero measurements. Normalization bounds are fixed across clips using the same algorithm; motion still depends on sampling cadence and preprocessing.

## Timing and consumer handoff

30 seconds, 900 decoded frames at 30 fps; 150 samples at 5 Hz, timestamps 0.0 through 29.8 seconds. Extraction checks decoded presentation timestamps against constant-frame-rate positions. No sample is fabricated at 30 seconds. Consumers must interpolate using `timeSeconds` and clamp before the first and after the last sample, including the final 0.2 seconds. Reset the audio state on seek/replay. All JSON features are bounded finite numbers. Keys, `id: ocean`, and public URLs match the supplied shared contract.

The web agent can replace its fixture with `/data/ocean.json` and `/media/ocean.mp4` without renaming fields. Display the credits and explain the North Pacific analysis region and visual-proxy limitations. Browser audio synthesis remains the web workstream's responsibility.

## Validation

```sh
.venv-data/bin/python -m unittest discover -s scripts -p 'test_*.py' -v
.venv-data/bin/python scripts/extract_features.py --validate-only
```

Validation checks version, identity, provenance fields, feature definitions, nonempty samples, finite numeric bounds (booleans rejected), zero first timestamp and motion, increasing timestamps, cadence, end coverage, fully decoded frame count, frame timestamps, and duration agreement within one video frame. `--validate-only` also compares the existing JSON against fresh extraction to catch a video/JSON mismatch. Tests include static-video decoding, static red/blue frames, mixed spatial colors, small and saturated changes, NaNs, empty masks, missing and corrupt media, and malformed track records. Detailed output statistics and saturation counts are in `ocean-validation.json`.

Features describe rendered colors, not recovered scientific observations. They depend on palette, encoding, mask, resolution and cadence. This source's fixed camera reduces contamination, but other clips would require mask review and could be affected by camera motion or overlays. Broad seasonality is a plausible interpretation of changing SST imagery; no scientific trends or physical quantities are inferred from these scores.

### Recorded result

Final video: **5,509,657 bytes (5.51 MB; 5.25 MiB)**, 1280×640, 30 fps, H.264 Main, yuv420p; no audio. All 900 frames decoded successfully with both OpenCV and FFmpeg. The MP4 `moov` atom precedes `mdat` (fast start). Six tests passed and a fresh extraction exactly matched the checked-in JSON in this environment. See `ocean-checks.json` for the verification record and `ocean-contact-sheet.jpg` for six inspected times with the ROI outlined in green. The outline is only in the review image, not the playback video. Regenerate it with `.venv-data/bin/python scripts/preview_ocean.py`.

| Feature | Minimum | Maximum | Standard deviation |
| --- | ---: | ---: | ---: |
| colorWarmth | 0.665344 | 0.733911 | 0.021990 |
| motion | 0.000000 | 0.662719 | 0.095301 |
| variation | 0.165084 | 0.426325 | 0.076489 |

The fixed mask retains 13,900 of 14,382 ROI pixels. Motion has **zero saturated samples**; warmth and variation also never reach either bound. Warmth has a modest range, so the sound mapping should make small changes audible without labeling them as temperature. No per-clip normalization was applied. Large original: 88,149,734 bytes, ignored and excluded from deployment.
