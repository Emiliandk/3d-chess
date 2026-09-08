"""Pack the user-supplied fire sequence for a single, reusable GPU upload.

Usage: python3 scripts/build-fire-atlas.py /path/to/reference-04.gif
Requires Pillow. The original GIF is never overwritten.
"""
from pathlib import Path
import hashlib
import json
import sys
from PIL import Image, ImageOps

source = Path(sys.argv[1])
destination = Path(__file__).resolve().parents[1] / 'assets/fireplace'
destination.mkdir(parents=True, exist_ok=True)
image = Image.open(source)
width, height, gutter, columns = 248, 136, 2, 8
rows = (image.n_frames + columns - 1) // columns
cell = (width + 2 * gutter, height + 2 * gutter)
atlas = Image.new('RGB', (columns * cell[0], rows * cell[1]))
durations = []
for index in range(image.n_frames):
    image.seek(index)
    durations.append(image.info.get('duration', 100) or 100)
    frame = image.convert('RGB').resize((width, height), Image.Resampling.LANCZOS)
    # Extend boundary pixels so linear filtering never reads another frame.
    padded = ImageOps.expand(frame, border=gutter)
    padded.paste(frame.crop((0, 0, width, 1)).resize((width, gutter)), (gutter, 0))
    padded.paste(frame.crop((0, height-1, width, height)).resize((width, gutter)), (gutter, height+gutter))
    padded.paste(padded.crop((gutter, 0, gutter+1, cell[1])).resize((gutter, cell[1])), (0, 0))
    padded.paste(padded.crop((width+gutter-1, 0, width+gutter, cell[1])).resize((gutter, cell[1])), (width+gutter, 0))
    atlas.paste(padded, ((index % columns)*cell[0], (index // columns)*cell[1]))
if len(set(durations)) != 1:
    raise ValueError('This source requires a variable-duration frame table.')
atlas.save(destination / 'natural-fire.webp', quality=88, method=6)
metadata = {
    'source': 'User-provided reference 04, 22fd9175f09fced6f5cde4421812d835.gif',
    'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'source_size': image.size, 'frame_size': [width, height],
    'frames': image.n_frames, 'frame_duration_ms': durations[0],
    'columns': columns, 'rows': rows, 'gutter': gutter,
    'atlas_size': atlas.size, 'encoding': 'WebP quality 88, Lanczos downsample; no upscaling'
}
(destination / 'natural-fire.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps({**metadata, 'bytes': (destination / 'natural-fire.webp').stat().st_size}))
