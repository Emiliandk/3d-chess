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

Glass shells use physical transmission. The amber liquid uses opaque physical
materials inside those shells so Three.js r180's transmission pass includes it.
This is a rendering approximation, with separate glossy level liquid surfaces.
