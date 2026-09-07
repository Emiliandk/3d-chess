# Cognac on the chess table

The two reference photographs were supplied by Emilian for this scene:

- `gourry-bottle-reference.png`: unchanged 1000 × 1000 RGBA photograph of the Gourry de Chadeville Très Vieux bottle.
- `riedel-glass-reference.jpeg`: unchanged 250 × 500 reference for the tall-stem tulip glass.

Editable geometry and materials live in `../../cognac-props.js`. The bottle label
and shoulder seal sample UV windows of the original PNG; no branding is redrawn.
The JPEG is the retained shape reference and is not downloaded during gameplay.

The glasses sit at each player's right, diagonally opposite one another. The
bottle is at the left-hand table edge from the default white-side view. Every
object rests at table height y = -0.53 and clears the board frame.

Both the clear shells and the cognac use physical transmission. Amber colour
comes from volume absorption; the bottle has greater optical depth than the
small servings. Each liquid volume has one continuous, level surface with a
slightly raised meniscus, without a second opaque disc or solid liquid shadow.

`../../cognac-render-pass.js` captures the scene with the hollow shells hidden,
then lets their refraction sample that image, including the liquid. This avoids
Three.js r180's opaque-only transmission-buffer limitation without changing the
vendored renderer. The capture uses linear colour, mipmaps and a capped resolution,
and runs only when the scene needs a redraw. Liquid thickness is an approximation,
not a ray-traced measurement; overlapping separate vessels and caustics are not
fully simulated.
