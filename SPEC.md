# Cave Painting: game design

Paint like an Upper Palaeolithic artist on a torch-lit cave wall.

## Atmosphere
- The whole board is a procedurally generated limestone wall (relief, cracks, calcite flowstone, iron stains).
- The only light is a torch whose flame sits in the bottom-right corner. Light falls off with distance, rakes across the relief, and flickers. The scene is never bright.
- The torch can be dragged anywhere (it leans while moving). When dropped, it swings back to its home spot.
- Sound is synthesised: fire roar and crackles, water drips, a low cave drone, tool scraping, breath through the blowpipe, all inside a long cave reverb.

## Tools (strokes)
| Tool | Historical basis | Mark |
|---|---|---|
| Finger | Fingertip and pigment paste | Wide, soft, runs dry along the stroke |
| Pigment lump | Ochre lump / charred stick used like chalk | Thin, grainy, never runs dry |
| Fur brush | Animal hair bound to a stick | Streaky parallel bristle lines |
| Chewed twig | Twig chewed into fibres | Fine fibrous line for contours |

Pen pressure widens strokes. Thin pigment catches only on raised grain; thick layers fill the hollows.

## Pigments
Only period colours: red ochre (hematite), burnt ochre, yellow ochre (goethite), umber, manganese black, charcoal, white kaolin. A unit test rejects saturated modern hues.

## Blowpipe stencils
Pick an object (hand, leaf, seashell), then press and hold on the wall. The object is held against the rock while pigment is blown around it, so only an outline (a halo outside the edge) is painted. The longer the press, the more pigment lands and the wider the halo; after 12 s the painter is out of breath. The rotate button (or one mouse-wheel notch) turns the object a quarter turn. There is no mirror option.

## Tracing paper
Lay a translucent sheet with a cave-art animal outline (mammoth, tiger, bison, horse) over the wall and trace it with any tool. The paper is a guide only: it is never part of the painting, is hidden in saved pictures, and is moved by dragging the bone pin at its top. Tap the selected animal again to take the paper away. Outlines are data in `src/content/animals.ts`.

## Language
The game is in French. All text is in `src/content/lines.json`.

## Other features
Undo / redo, size slider, autosave, save a picture (PNG), export / import the painting (JSON), a fresh wall, left-handed layout, calmer flame (reduced motion).
