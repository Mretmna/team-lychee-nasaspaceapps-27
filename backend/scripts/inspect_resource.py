"""Review a candidate locally without writing production video or track JSON."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from extract_features import sha256

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('input', type=Path)
p.add_argument('--output-prefix', type=Path, required=True)
a = p.parse_args()
if not a.input.is_file():
    p.error(f'Missing input: {a.input}')
cap = cv2.VideoCapture(str(a.input))
if not cap.isOpened():
    p.error('Cannot decode candidate video')
fps = cap.get(cv2.CAP_PROP_FPS)
count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
if not np.isfinite(fps) or fps <= 0 or count < 1:
    p.error('Invalid video metadata')
duration = count / fps
frames = []
times = np.linspace(0, min(duration - 1 / fps, 60), 6)
for t in times:
    cap.set(cv2.CAP_PROP_POS_MSEC, float(t * 1000))
    ok, frame = cap.read()
    if not ok:
        p.error(f'Cannot decode frame at {t:.3f}s')
    frame = cv2.resize(frame, (640, 320))
    label = np.zeros((28, 640, 3), dtype=np.uint8)
    cv2.putText(label, f'{t:.2f} seconds', (10, 20), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 255, 255), 1)
    frames.append(np.vstack((frame, label)))
report = dict(sourceFile=a.input.name, sha256=sha256(a.input), bytes=a.input.stat().st_size, fps=fps, frameCount=count, durationSeconds=duration, width=cap.get(cv2.CAP_PROP_FRAME_WIDTH), height=cap.get(cv2.CAP_PROP_FRAME_HEIGHT), previewTimesSeconds=times.tolist(), status='candidate only; no production features extracted')
cap.release()
a.output_prefix.parent.mkdir(parents=True, exist_ok=True)
a.output_prefix.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
if not cv2.imwrite(str(a.output_prefix.with_suffix('.jpg')), np.vstack([np.hstack(frames[i:i+2]) for i in range(0, 6, 2)])):
    p.error('Cannot save contact sheet')
print(json.dumps(report, indent=2))
