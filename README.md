# US Legends 3D Car Builder (Three.js)

A rebuild of the [Sketchfab-based configurator](https://github.com/tattooprojects/US-Legends-Configurator) with the same interface and interactions, running on [Three.js](https://threejs.org) instead of Sketchfab. There is no Sketchfab account, iframe or watermark dependency. Everything is served from this site.

> **Status:** all three cars use the artist's real models. The Legends Sedan and Legends Coupe are built from the Cinema 4D scene, and the Bandolero from the artist's own glTF export. See [Rebuilding the models](#rebuilding-the-models-from-cinema-4d).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Local development server, including the lead form (dry run) |
| `npm run build` | Production build into `dist/` (what Netlify serves) |
| `npm run preview` | Serve the production build locally |
| `npm run build:demo` | Site in `dist-demo/` for a Netlify drag-and-drop deploy. Drag-and-drop deploys can't run the lead function, so the form confirms without sending |
| `npm run build:preview` | Static copy in `dist-preview/` for sharing a preview without a server, shaped for strict hosts such as a claude.ai preview page (lead form does not send) |
| `npm run models:c4d -- export.gltf tex/` | Build `sedan.glb` and `coupe.glb` from the Cinema 4D export ([details](#rebuilding-the-models-from-cinema-4d)) |
| `npm run models:bandolero -- Bandolero.gltf` | Build `bandolero.glb` from the artist's Bandolero export ([details](#the-bandolero)) |
| `npm run models:inspect -- file.glb` | List a model's part and material names |
| `npm run models:optimize -- in.glb out.glb` | Compress any other raw model export for the web |

## How it's organized

```
src/lib/config/cars.js        ← the one file to edit: cars, options, labels, colors, camera
src/lib/viewer/CarViewer.js   ← the 3D viewer (replaces Sketchfab)
src/lib/components/           ← interface: option panel, hotspots, carousel, color picker, form
src/lib/lead.js               ← builds and sends the lead
netlify/functions/submit.mjs  ← forwards leads to uslegendcars.com
src/assets/models/            ← one .glb per car
src/assets/thumbs/            ← option thumbnails
scripts/                      ← model tools (Cinema 4D build, Bandolero build, inspect, optimize)
scripts/cinema4d/             ← export script to run inside Cinema 4D
scripts/c4d-materials.mjs     ← web materials for all three cars
```

### How the 3D works (same idea as the Sketchfab build)

Each car is **one model file containing every option**, stacked in the same space. Choosing an option hides the other parts in that group and shows the one picked. Color recolors the paint materials. The difference from the Sketchfab build is that parts and materials are found **by name**, not by numeric ID or list position. A re-exported model can't silently break the mapping, and the browser console warns about any name in the config that the model doesn't contain.

## Rebuilding the models from Cinema 4D

The sedan and coupe come from one Cinema 4D scene, **Legend Cars.c4d**. It holds both cars together: shared front ends, wheels, tires and exhausts, plus each car's own bodies and chassis. The artist rendered it with Octane, so its materials don't export. The pipeline keeps their names and swaps in web materials.

1. **Export from Cinema 4D** (2023 or newer; the free trial works). Open *Extensions › Script Manager*, load `scripts/cinema4d/export_legend_cars.py`, run it, and pick `Legend Cars.c4d`. The script never changes the .c4d file. It writes a `web-export` folder next to it containing `legend-cars-named.gltf`, a preview image of every material, and `materials.txt`.
2. **Build the web models:**
   ```bash
   npm run models:c4d -- "path/to/web-export/legend-cars-named.gltf" "path/to/tex"
   ```
   `tex` is the texture folder that ships with the .c4d file; the tire sidewall lettering comes from it. This writes `src/assets/models/sedan.glb` and `coupe.glb`. For each car it:
   - keeps only that car's parts
   - applies the web materials
   - merges small pieces
   - simplifies the geometry from about 4.2 million to about 1.25 million triangles (about 10 MB per car), keeping tires, wheels and paint at nearly full detail
   - recalculates smooth normals on the paint, so reflections stay clean
   - turns the car to face +X on the ground
3. **If the scene changes**, check these:
   - New or renamed materials: map their numbers in `scripts/c4d-materials.mjs`. The previews and `materials.txt` show what each number is.
   - New options: add them to `src/lib/config/cars.js`. Their `node` is the Cinema 4D object name; `npm run models:inspect -- src/assets/models/sedan.glb` lists the names.
   - Too much or too little detail: adjust `simplifyError` in `scripts/build-c4d-models.mjs`.

### The Bandolero

The Bandolero isn't in the Cinema 4D scene. The artist exported it separately as **Bandolero.gltf** (in the `Bandolero` folder of the model files), with ordinary materials instead of Octane, so no Cinema 4D step is needed. (`BandoleroBody.gltf` and `BandoleroWheels.gltf` in the same folder are older partial exports and aren't used.)

```bash
npm run models:bandolero -- "path/to/Bandolero/Bandolero.gltf"
```

This writes `src/assets/models/bandolero.glb` (about 1.7 MB). It:
- groups the car into five named parts: BODY, CHASSIS, WHEELS, WINDSHIELD, BODY FASTENERS
- swaps the file's materials for web materials (`BANDOLERO_TO_WEB` in `scripts/c4d-materials.mjs`); the Hoosier sidewall keeps the file's own textures
- simplifies about 985,000 triangles to about 200,000, keeping tires and paint at nearly full detail
- recalculates smooth normals on the paint
- scales it to the Legends cars' units and turns it to face +X on the ground

The Bandolero has no part options, only body color, so it has no hotspots.

### Any other model

Anything else exported straight to glTF can go through `npm run models:optimize`. If a model loads facing the wrong way, set `modelRotationDeg: [x, y, z]` on that car in the config; the app expects the front toward +X with Y up.

Open the site with `?debug` (for example `http://localhost:5173/?debug`) to print every part and material name in the browser console.

## Leads

The form posts to `/api/submit`, a Netlify Function that forwards to US Legends. The payload keeps the Sketchfab build's shape, plus a new `car` field. The old payload never said which car the build was for.

```json
{
  "car": "Legends Sedan",
  "color": "blue",
  "parts": { "body": "37 Ford", "frontEnd": "37 Ford", "wheel": "Basset", "tire": "Asphalt", "exhaust": "Long Exhaust" },
  "customerData": { "firstName": "…", "lastName": "…", "address": "…", "address2": "", "city": "…", "state": "…", "zip": "…", "phone": "…", "email": "…" }
}
```

Set these in Netlify (*Site configuration › Environment variables*):

| Variable | Value |
|---|---|
| `LEAD_ENDPOINT_URL` | `https://www.uslegendcars.com/car-builder.cfc?method=process` |
| `LEAD_ORIGIN` | Optional. The `Origin` header to send. Defaults to `https://usl-car-builder.netlify.app`, which the old build sent. |

The variable controls where submissions go:

- **Unset, locally or on preview deploys:** nothing is forwarded (dry run), so testing never sends fake leads to US Legends.
- **Unset on the production site:** submissions fail with an error instead of being silently dropped.

## Deploy (Netlify)

`netlify.toml` is included: the build command is `npm run build`, the publish folder is `dist`, and functions live in `netlify/functions`. To deploy, connect the repo in Netlify and set the environment variables above.

## Changes from the Sketchfab build

- Sketchfab removed; models are served from this site and parts are found by name.
- Fixed: the first front-end option was labeled "37 Chevy" but showed the 34 Chevy front end.
- Fixed: the selected-option highlight followed button position instead of the actual choice.
- Fixed: the form no longer lets the browser reload the page mid-send. It also shows a sending state and validates on the server.
- Added: a "Request a build" path for the Bandolero.
- Added: body color on phones, as the last carousel step. The old build hid it.
- Added: each car keeps its choices when you switch tabs, and hotspot labels appear on hover.
- All cars, options, labels and colors now live in one config file.

## Open items

- [ ] Review the web materials against the original renders. The Legends materials were matched by eye from the Octane material previews, and the Bandolero's were adjusted from the file's own; a few small parts may need a different finish (`scripts/c4d-materials.mjs`).
- [ ] Look-development against the current Sketchfab rendering (lighting, reflections, paint finish).
- [ ] Confirm with US Legends that their endpoint accepts the new `car` field and the corrected "34 Chevy" label.
- [ ] Optional label check: "Basset" vs the brand name "Bassett" (it's sent with leads).
- [ ] Optional: attach a rendered image of the build to each lead (`viewer.snapshot()` is ready).
