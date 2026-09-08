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

The floor reflection reuses this atlas and the firebox's time uniform. Its
feather support is limited to panorama pixels x536–736, y602–748, below the
marble hearth. A vertically flipped, softened sample modulates the existing
golden reflection and adds warm light through the original wood grain. The
floor samples the same prefiltered room texture, blur and exposure as the
background; neither the panorama nor the atlas is rewritten. This is a local
animated reflection in the panoramic room, not a ray-traced mirror.

Both patches follow the background's camera translation/rotation and are
occluded by the 3D table and pieces. They advance together at at most 24 fps
when either patch is on-screen, freeze together for reduced motion and stop
requesting frames when both are off-screen. The environment texture is shared
and is never disposed by the fireplace controller.
