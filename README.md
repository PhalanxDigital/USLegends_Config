# US Legends 3D Car Builder (Three.js)

A rebuild of the [Sketchfab-based configurator](https://github.com/tattooprojects/US-Legends-Configurator) with the same interface and interactions, running on [Three.js](https://threejs.org) instead of Sketchfab. There is no Sketchfab account, iframe or watermark dependency. Everything is served from this site.

> **Status:** working end to end on placeholder 3D models. The placeholders use the same part names as the real Sketchfab sedan, so the real files drop in without code changes. See [Dropping in the real models](#dropping-in-the-real-models).

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
| `npm run build:single` | One self-contained HTML file in `dist-preview/` for sharing a preview (lead form does not send) |
| `npm run models:inspect -- file.glb` | List a model's part and material names |
| `npm run models:optimize -- in.glb out.glb` | Compress a raw model export for the web |
| `npm run models:placeholder` | Regenerate the placeholder models |

## How it's organized

```
src/lib/config/cars.js        ← the one file to edit: cars, options, labels, colors, camera
src/lib/viewer/CarViewer.js   ← the 3D viewer (replaces Sketchfab)
src/lib/components/           ← interface: option panel, hotspots, carousel, color picker, form
src/lib/lead.js               ← builds and sends the lead
netlify/functions/submit.mjs  ← forwards leads to uslegendcars.com
src/assets/models/            ← one .glb per car
src/assets/thumbs/            ← option thumbnails
scripts/                      ← model tools (inspect, optimize, placeholder generator)
```

### How the 3D works (same idea as the Sketchfab build)

Each car is **one model file containing every option**, stacked in the same space. Choosing an option hides the other parts in that group and shows the one picked. Color recolors the paint materials. The difference from the Sketchfab build is that parts and materials are found **by name**, not by numeric ID or list position. A re-exported model can't silently break the mapping, and the browser console warns about any name in the config that the model doesn't contain.

## Dropping in the real models

1. **Export** each car from the source files (Cinema 4D: *File › Export › glTF*, binary `.glb`), or download the glTF version from the Sketchfab model page. Every option must be its own named object, just as it is today.
2. **Optimize:**
   ```bash
   npm run models:optimize -- models-source/sedan.glb src/assets/models/sedan.glb
   ```
   Raw exports can go in `models-source/`, which git ignores.
3. **Inspect** and copy names into `src/lib/config/cars.js`:
   ```bash
   npm run models:inspect -- src/assets/models/sedan.glb
   ```
   - Each option's `node` must match a part name. Matching ignores case, spaces, punctuation and Sketchfab's `_123` suffixes.
   - Put the body-paint material names in `paintMaterials`. On the real sedan they are the 13th and 19th materials.
4. **Orient:** if the car loads facing the wrong way or lying on its side, set `modelRotationDeg: [x, y, z]` on that car in the config, for example `[-90, 0, 0]` for a Z-up export. The app expects the front to point toward +X with Y up.
5. **Tune** the hotspot `anchor` positions and `camera` values in the config.
6. **Finish:** set `USING_PLACEHOLDER_MODELS = false` to remove the "placeholder" notice.

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

- [ ] Real model files for the sedan, coupe and Bandolero. Then confirm part and material names, orientation and hotspot anchors.
- [ ] Look-development against the current Sketchfab rendering (lighting, reflections, paint finish).
- [ ] Confirm with US Legends that their endpoint accepts the new `car` field and the corrected "34 Chevy" label.
- [ ] Optional label check: "Basset" vs the brand name "Bassett" (it's sent with leads).
- [ ] Optional: attach a rendered image of the build to each lead (`viewer.snapshot()` is ready).
