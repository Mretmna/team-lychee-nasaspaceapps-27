"""Create a contact sheet with the extraction ROI for visual mask review."""
from pathlib import Path
import cv2
import numpy as np
from extract_features import ROI
cap = cv2.VideoCapture('public/media/ocean.mp4')
images = []
for t in (0, 5, 10, 15, 20, 29.8):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError(f'Cannot decode preview at {t}s')
    h, w = frame.shape[:2]
    a, b, c, d = [int(ROI[i] * (w if i % 2 == 0 else h)) for i in range(4)]
    cv2.rectangle(frame, (a, b), (c, d), (0, 255, 0), 2)
    frame = cv2.resize(frame, (640, 320), interpolation=cv2.INTER_AREA)
    cv2.putText(frame, f'{t:.1f}s / North Pacific ROI', (12, 304), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 255, 255), 1)
    images.append(frame)
cap.release()
Path('docs').mkdir(exist_ok=True)
cv2.imwrite('docs/ocean-contact-sheet.jpg', np.vstack([np.hstack(images[i:i+2]) for i in range(0, 6, 2)]))
