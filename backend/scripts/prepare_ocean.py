#!/usr/bin/env python3
"""Encode source seconds [0,30) as a silent, browser-oriented 30fps MP4."""
import argparse
from datetime import datetime
from zoneinfo import ZoneInfo
import json
from pathlib import Path
import subprocess
import imageio_ffmpeg
from extract_features import sha256

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--input', type=Path, default=Path('.cache-data/source.mp4'))
p.add_argument('--output', type=Path, default=Path('../frontend/public/media/ocean.mp4'))
a = p.parse_args()
if not a.input.is_file():
    p.error(f'Missing source: {a.input}')
if a.input.resolve() == a.output.resolve():
    p.error('Input and output must differ')
a.output.parent.mkdir(parents=True, exist_ok=True)
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ffmpeg, '-hide_banner', '-y', '-i', str(a.input), '-ss', '0', '-t', '30', '-map', '0:v:0', '-an', '-sn', '-dn', '-vf', 'scale=1280:640:flags=lanczos,fps=30,setsar=1', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'main', '-level:v', '3.1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', str(a.output)]
subprocess.run(cmd, check=True)
record = dict(sourcePage='https://svs.gsfc.nasa.gov/5101/', sourceDownload='https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005101/sst_30_sec_no-dates_4096x2048_2x1_30p.mp4', preparedOn=datetime.now(ZoneInfo('Europe/Istanbul')).date().isoformat(), sourceSha256=sha256(a.input), sourceBytes=a.input.stat().st_size, clipStartSeconds=0, clipEndSeconds=30, speed=1, ffmpegVersion=subprocess.check_output([ffmpeg, '-version'], text=True).splitlines()[0], command=['ffmpeg', *cmd[1:]], outputSha256=sha256(a.output))
Path('docs/ocean-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
