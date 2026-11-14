#!/usr/bin/env python3
"""Offline extraction for the NASA ocean clip; never part of the web build."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import cv2
import numpy as np

SOURCE = 'https://svs.gsfc.nasa.gov/5101/'
CREDITS = "NASA's Scientific Visualization Studio. Visualizers: Kel Elkins (USRA), Greg Shirah (NASA/GSFC). Data: JPL MUR SST analysis."
KEYS = ('colorWarmth', 'motion', 'variation')
DEFINITIONS = {
    'colorWarmth': 'Mean (R-B+1)/2 of decoded RGB in the fixed North Pacific mask; RGB scaled to [0,1]; not measured temperature.',
    'motion': 'Mean absolute RGB difference from the preceding sampled frame, divided by 0.05 and clipped to [0,1]; not measured current speed. First sample is zero (no preceding frame).',
    'variation': 'Twice the root mean of the three spatial RGB channel variances within the fixed mask; not a scientific variability measurement.'
}
# Normalized image coordinates, half-open rectangle. No geographical area weighting.
ROI = (0.03, 0.28, 0.14, 0.44)


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate(track, duration, fps, cadence=None):
    if type(track) is not dict or type(track.get('schemaVersion')) is not int or track['schemaVersion'] != 1:
        raise ValueError('schemaVersion must be integer 1')
    for key in ('id', 'title', 'videoUrl', 'sourceUrl', 'credits'):
        if not isinstance(track.get(key), str) or not track[key].strip() or 'REPLACE_' in track[key]:
            raise ValueError(f'{key} must be a nonempty real value')
    if track['id'] != 'ocean' or track['videoUrl'] != '/media/ocean.mp4' or track['sourceUrl'] != SOURCE:
        raise ValueError('Unexpected ocean identity, video URL, or verified source page')
    d = track.get('durationSeconds')
    if not finite_number(d) or d <= 0 or abs(d - duration) > 1 / fps:
        raise ValueError('durationSeconds must agree with decoded media within one frame')
    definitions = track.get('featureDefinitions')
    if not isinstance(definitions, dict) or any(not isinstance(definitions.get(k), str) or not definitions[k].strip() for k in KEYS):
        raise ValueError('Missing feature definitions')
    samples = track.get('samples')
    if not isinstance(samples, list) or not samples:
        raise ValueError('samples must be a nonempty array')
    previous = -1
    for i, sample in enumerate(samples):
        if not isinstance(sample, dict):
            raise ValueError(f'sample {i} must be an object')
        t = sample.get('timeSeconds')
        if not finite_number(t) or t < 0 or t <= previous or t > d or (i == 0 and t != 0):
            raise ValueError(f'Invalid timestamp at sample {i}')
        if cadence and abs(t - i / cadence) > 1e-6:
            raise ValueError(f'Sample {i} is off the declared cadence')
        for key in KEYS:
            if not finite_number(sample.get(key)) or not 0 <= sample[key] <= 1:
                raise ValueError(f'Invalid {key} at sample {i}')
        previous = t
    if samples[0]['motion'] != 0:
        raise ValueError('First motion must be zero by convention')
    if cadence and (d - previous > 1 / cadence + 1e-6 or len(samples) != math.ceil(d * cadence - 1e-6)):
        raise ValueError('Sample coverage does not reach the end of the clip')


def measure(rgb, previous, mask):
    if rgb.dtype != np.float64 or rgb.ndim != 3 or rgb.shape[2] != 3 or not np.isfinite(rgb).all() or rgb.min() < 0 or rgb.max() > 1:
        raise ValueError('Expected finite normalized float64 RGB pixels')
    if mask.dtype != bool or mask.shape != rgb.shape[:2] or not mask.any():
        raise ValueError('Mask must be a nonempty boolean image of matching size')
    pixels = rgb[mask]
    warmth = ((pixels[:, 0] - pixels[:, 2] + 1) / 2).mean()
    raw_motion = 0.0
    if previous is not None:
        if previous.shape != rgb.shape or not np.isfinite(previous).all():
            raise ValueError('Invalid preceding frame')
        raw_motion = float(np.abs(pixels - previous[mask]).mean() / 0.05)
    variation = 2 * np.sqrt(pixels.var(axis=0).mean())
    return dict(colorWarmth=float(warmth), motion=float(np.clip(raw_motion, 0, 1)), variation=float(np.clip(variation, 0, 1))), raw_motion


def decode(path, hz):
    if not path.is_file():
        raise ValueError(f'Media does not exist: {path}')
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise ValueError(f'Cannot decode media: {path}')
        fps = cap.get(cv2.CAP_PROP_FPS)
        count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if not math.isfinite(fps) or fps <= 0 or not math.isfinite(count) or count < 1:
            raise ValueError('Invalid video frame rate or frame count')
        stride = round(fps / hz)
        if stride < 1 or abs(stride * hz - fps) > 1e-6:
            raise ValueError('Requires constant frame rate that is an integer multiple of sample rate; prepare clip first')
        frames, timestamps = [], []
        i = 0
        shape = None
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if shape is None:
                shape = frame.shape
            if frame.shape != shape:
                raise ValueError('Video dimensions changed during decoding')
            t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if not math.isfinite(t) or abs(t - i / fps) > 0.001:
                raise ValueError('Nonuniform or unsupported video timestamps; prepare CFR clip first')
            if i % stride == 0:
                # Keep only ROI pixels; extraction uses the final resolution with no resizing.
                h, w = frame.shape[:2]
                x0, y0, x1, y1 = [int(ROI[j] * (w if j % 2 == 0 else h)) for j in range(4)]
                rgb = cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2RGB).astype(np.float64) / 255
                frames.append(rgb)
                timestamps.append(round(t, 9))
            i += 1
        if i != round(count):
            raise ValueError(f'Incomplete decode: expected {count:g} frames, decoded {i}')
        if not frames or frames[0].size == 0:
            raise ValueError('No usable frames or empty region')
        return frames, timestamps, i / fps, fps, i, shape
    finally:
        cap.release()


def extract(path, hz):
    frames, times, duration, fps, count, shape = decode(path, hz)
    # Exclude dark or neutral land/islands and a one-pixel halo for the whole clip.
    mask = np.logical_and.reduce([(f.max(axis=2) > 0.20) & ((np.ptp(f, axis=2) > 0.06) | (f.min(axis=2) > 0.60)) for f in frames])
    mask = cv2.erode(mask.astype(np.uint8), np.ones((3, 3), np.uint8), borderType=cv2.BORDER_CONSTANT, borderValue=0).astype(bool)
    if mask.sum() < 100:
        raise ValueError('Fewer than 100 valid pixels remain in the ocean mask')
    samples, raw = [], []
    previous = None
    for frame, t in zip(frames, times):
        values, raw_motion = measure(frame, previous, mask)
        samples.append({'timeSeconds': t, **{k: round(v, 9) for k, v in values.items()}})
        raw.append(raw_motion)
        previous = frame
    track = dict(schemaVersion=1, id='ocean', title='Ocean Jukebox — North Pacific Color Seasons', videoUrl='/media/ocean.mp4', durationSeconds=duration, sourceUrl=SOURCE, credits=CREDITS, featureDefinitions=DEFINITIONS, samples=samples)
    validate(track, duration, fps, hz)
    report = dict(videoSha256=sha256(path), videoBytes=path.stat().st_size, durationSeconds=duration, frames=count, fps=fps, width=shape[1], height=shape[0], sampleRateHz=hz, sampleCount=len(samples), roi=ROI, maskPixels=int(mask.sum()), roiPixels=int(mask.size), motionPreclipMax=max(raw), motionSaturatedSamples=sum(v >= 1 for v in raw), features={k: {'min': min(s[k] for s in samples), 'max': max(s[k] for s in samples), 'mean': float(np.mean([s[k] for s in samples])), 'std': float(np.std([s[k] for s in samples]))} for k in KEYS})
    return track, report, mask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('../frontend/public/media/ocean.mp4'))
    parser.add_argument('--output', type=Path, default=Path('../frontend/public/data/ocean.json'))
    parser.add_argument('--sample-rate', type=float, default=5)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--mask-output', type=Path)
    parser.add_argument('--validate-only', action='store_true', help='Validate existing JSON against fully decoded media; write nothing')
    args = parser.parse_args()
    try:
        if not math.isfinite(args.sample_rate) or args.sample_rate <= 0:
            raise ValueError('sample-rate must be finite and positive')
        if args.input.resolve() == args.output.resolve():
            raise ValueError('Input and output must be different paths')
        track, report, mask = extract(args.input, args.sample_rate)
        if args.validate_only:
            existing = json.loads(args.output.read_text())
            validate(existing, report['durationSeconds'], report['fps'], args.sample_rate)
            if existing != track:
                raise ValueError('Existing JSON does not match reproducible extraction of this video')
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(track, indent=2, allow_nan=False) + '\n')
            if args.report:
                args.report.parent.mkdir(parents=True, exist_ok=True)
                args.report.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
            if args.mask_output:
                args.mask_output.parent.mkdir(parents=True, exist_ok=True)
                if not cv2.imwrite(str(args.mask_output), mask.astype(np.uint8) * 255):
                    raise ValueError('Could not write mask image')
        print(json.dumps(report, indent=2, allow_nan=False))
    except (ValueError, OSError, cv2.error) as exc:
        parser.exit(2, f'error: {exc}\n')


if __name__ == '__main__':
    main()
