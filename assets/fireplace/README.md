# Natural fireplace sequence

The site owner supplied five animated fireplace references on 2026-09-08 and
requested their style of natural, rising flames and glowing wood. This layer
uses reference 04 (`22fd9175f09fced6f5cde4421812d835.gif`), 498 × 273 pixels,
99 frames at 90 ms per frame. Source hash and export dimensions are recorded in
`natural-fire.json`. No new ownership or licence claim is made for the source.

`natural-fire.webp` packs the decoded sequence in one static texture. The 248 ×
136 frames have two pixels of extruded padding. Linear filtering without
mipmaps keeps neighbouring frames separate; the shader blends adjacent frames
at the original 8.91-second loop timing. The source has been downsampled, not
upscaled. WebP quality is 88. The atlas is 2016 × 1820 pixels (under 2048 on each
axis), uses one GPU upload and does not depend on video autoplay or a codec.

Rebuild with Pillow:

```sh
python3 scripts/build-fire-atlas.py /path/to/22fd9175f09fced6f5cde4421812d835.gif
```

The original GIF is preserved separately from the runtime export. The live
shader crops 9% from each horizontal side, softens focus, darkens the brick
recess and feathers the result inside the existing firebox. The marble,
mantel and the original library panorama file are untouched. Reduced motion
holds the new sequence at frame zero. If the atlas cannot load, the original
panorama fire remains visible and chess play can continue.
