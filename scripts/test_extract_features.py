import copy
import tempfile
import unittest
from pathlib import Path
import numpy as np
from extract_features import measure, validate, decode, extract, SOURCE, DEFINITIONS, CREDITS

class Features(unittest.TestCase):
    def setUp(self):
        self.mask = np.ones((10, 10), dtype=bool)
        self.red = np.zeros((10, 10, 3), dtype=np.float64)
        self.red[:, :, 0] = 1
        self.blue = self.red[:, :, ::-1].copy()

    def test_static_and_warmth(self):
        red, _ = measure(self.red, self.red, self.mask)
        blue, _ = measure(self.blue, None, self.mask)
        self.assertEqual(red, dict(colorWarmth=1, motion=0, variation=0))
        self.assertEqual(blue, dict(colorWarmth=0, motion=0, variation=0))

    def test_change_and_variation(self):
        mixed = self.red.copy()
        mixed[:5] = self.blue[:5]
        values, raw = measure(mixed, self.red, self.mask)
        self.assertAlmostEqual(values['colorWarmth'], .5)
        self.assertGreater(values['variation'], .8)
        self.assertEqual(values['motion'], 1)
        self.assertGreater(raw, 1)
        slight = self.red.copy()
        slight[:, :, 0] -= .03
        values, _ = measure(slight, self.red, self.mask)
        self.assertAlmostEqual(values['motion'], .2)

    def test_invalid_pixels(self):
        self.red[0, 0, 0] = np.nan
        with self.assertRaises(ValueError):
            measure(self.red, None, self.mask)
        with self.assertRaises(ValueError):
            measure(self.blue, None, ~self.mask)

    def test_bad_media(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'bad.mp4'
            with self.assertRaisesRegex(ValueError, 'does not exist'):
                decode(path, 5)
            path.write_text('not video')
            with self.assertRaisesRegex(ValueError, 'Cannot decode'):
                decode(path, 5)

    def test_schema_rejects_invalid(self):
        base = dict(schemaVersion=1, id='ocean', title='Test', videoUrl='/media/ocean.mp4', sourceUrl=SOURCE, credits=CREDITS, featureDefinitions=DEFINITIONS, durationSeconds=.4, samples=[dict(timeSeconds=0, colorWarmth=.5, motion=0, variation=.2), dict(timeSeconds=.2, colorWarmth=.6, motion=.1, variation=.3)])
        validate(base, .4, 30, 5)
        for key, value in [('samples', []), ('durationSeconds', 2), ('credits', ''), ('schemaVersion', True)]:
            bad = copy.deepcopy(base)
            bad[key] = value
            with self.assertRaises(ValueError):
                validate(bad, .4, 30, 5)
        for key, value in [('timeSeconds', 0), ('timeSeconds', .5), ('motion', float('nan')), ('colorWarmth', -1), ('variation', True), ('motion', None)]:
            bad = copy.deepcopy(base)
            bad['samples'][1][key] = value
            with self.assertRaises(ValueError):
                validate(bad, .4, 30, 5)

    def test_static_video_pipeline(self):
        import cv2
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'static.avi'
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'MJPG'), 30, (640, 320))
            self.assertTrue(writer.isOpened())
            frame = np.full((320, 640, 3), (50, 80, 180), dtype=np.uint8)
            for _ in range(30):
                writer.write(frame)
            writer.release()
            track, report, _ = extract(path, 5)
            self.assertEqual(report['sampleCount'], 5)
            self.assertEqual(track['durationSeconds'], 1)
            self.assertTrue(all(s['motion'] == 0 for s in track['samples']))

if __name__ == '__main__':
    unittest.main()
