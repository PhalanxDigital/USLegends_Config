/**
 * THE ONE FILE TO EDIT when cars, options, labels, colors or models change.
 *
 * - `node` is the part name inside the 3D model. Matching ignores case, spaces,
 *   punctuation and Sketchfab-style "_123" suffixes, so "RIMS (BEADLOCK)" also
 *   matches "RIMS( BEADLOCK)_773". Run `npm run models:inspect -- file.glb`
 *   to list the names in a model.
 * - `label` is what the shopper sees. `leadValue` (optional) is what is sent with
 *   the lead if it should differ from the label.
 * - `anchor` places a category's hotspot dot: [x, y, z] from 0 to 1 inside the
 *   bounding box of the selected part (x: rear to front, y: bottom to top,
 *   z: right side to left side).
 * - Optional per car: `modelRotationDeg: [x, y, z]` if a model loads facing the
 *   wrong way (the app expects the front toward +X, Y up), and
 *   `paintKeepsTexture: true` to keep a paint material's texture when recoloring.
 */
import { thumb, model } from './assets.js';

/** Set to false once the real 3D models are in place. Shows a small notice on the viewer. */
export const USING_PLACEHOLDER_MODELS = true;

/** Body colors. `swatch` is the button color, `paint` is applied to the paint materials. */
export const PAINT_COLORS = [
  { id: 'white', label: 'White', swatch: '#ffffff', paint: '#cccccc' },
  { id: 'red', label: 'Red', swatch: '#ff1a0d', paint: '#ff0800' },
  { id: 'black', label: 'Black', swatch: '#000000', paint: '#0b0b0b' },
  { id: 'blue', label: 'Blue', swatch: '#1426ff', paint: '#081aff' },
  { id: 'yellow', label: 'Yellow', swatch: '#ffd21a', paint: '#ffc91a' },
];

/** Camera behavior shared by all cars (each car can override any value). */
const CAMERA = {
  fov: 30,
  startAzimuthDeg: 38, // where the camera starts, measured from the front of the car toward its left side
  elevationDeg: 10, // tilt is locked at this angle, like the Sketchfab version
  distance: 1.15, // 1 = the whole car just fits; larger = further away
  mobileDistance: 1.0,
  minDistance: 0.85,
  maxDistance: 1.7,
  mobileMaxDistance: 2.2,
  targetDrop: 0.18, // aim below the car's middle (fraction of its height) to lift it clear of the bottom buttons
};

const LEGENDS_FRONT_ENDS = {
  id: 'frontEnd',
  title: 'Front End Style',
  leadKey: 'frontEnd',
  anchor: [0.86, 0.95, 0.5],
  options: [
    // Was labeled "37 Chevy" in the Sketchfab build, but this part is the 34 Chevy front end.
    { id: 'chevy34', label: '34 Chevy', node: '34 CHEVY FRONT END', thumb: thumb('34ChevyFE.png') },
    { id: 'ford37', label: '37 Ford', node: '37 FORD FRONT END', thumb: thumb('37FordFE.png') },
    { id: 'ford34', label: '34 Ford', node: '34 FORD FRONT END', thumb: thumb('34FordFE.png') },
  ],
};

const LEGENDS_WHEELS = {
  id: 'wheel',
  title: 'Wheels',
  leadKey: 'wheel',
  anchor: [0.93, 0.5, 1.0],
  options: [
    { id: 'basset', label: 'Basset', node: 'RIMS (BASSET)', thumb: thumb('Basset.png') },
    { id: 'beadlock', label: 'Beadlock', node: 'RIMS (BEADLOCK)', thumb: thumb('Beadlock.png') },
    { id: 'aero', label: 'Aero', node: 'RIMS (AERO)', thumb: thumb('Aero.png') },
  ],
};

const LEGENDS_TIRES = {
  id: 'tire',
  title: 'Tires',
  leadKey: 'tire',
  anchor: [0.97, 0.3, 0.96],
  options: [
    { id: 'asphalt', label: 'Asphalt', node: 'TIRES (ASPHALT)', thumb: thumb('Asphalt.png') },
    { id: 'dirt', label: 'Dirt', node: 'TIRES (DIRT)', thumb: thumb('Dirt.png') },
  ],
};

const LEGENDS_EXHAUSTS = {
  id: 'exhaust',
  title: 'Exhausts',
  leadKey: 'exhaust',
  anchor: [0.4, 0.5, 0.0],
  options: [
    { id: 'long', label: 'Long Exhaust', node: 'LONG EXHAUST' },
    { id: 'short', label: 'Short Exhaust', node: 'SHORT EXHAUST' },
  ],
};

/**
 * Cars, in tab order. The hotspot numbers follow the order of `categories`.
 */
export const CARS = [
  {
    id: 'bandolero',
    tabLabel: 'Bandolero',
    leadName: 'Bandolero',
    model: model('bandolero.glb'),
    paintMaterials: ['BODY PAINT'],
    categories: [],
    camera: { ...CAMERA },
  },
  {
    id: 'coupe',
    tabLabel: 'Legends Coupe',
    leadName: 'Legends Coupe',
    model: model('coupe.glb'),
    // TODO when the real coupe model arrives: confirm part and material names with models:inspect.
    paintMaterials: ['BODY PAINT', 'FRONT END PAINT'],
    categories: [
      {
        id: 'body',
        title: 'Body Style',
        leadKey: 'body',
        anchor: [0.62, 0.62, 1.0],
        options: [
          { id: 'chevy34', label: '34 Chevy', node: '34 CHEVY COUPE BODY', thumb: thumb('34ChevyCBody.png') },
          { id: 'ford34', label: '34 Ford', node: '34 FORD COUPE BODY', thumb: thumb('34FordCBody.png') },
        ],
      },
      LEGENDS_FRONT_ENDS,
      LEGENDS_WHEELS,
      LEGENDS_TIRES,
      LEGENDS_EXHAUSTS,
    ],
    camera: { ...CAMERA },
  },
  {
    id: 'sedan',
    tabLabel: 'Legends Sedan',
    leadName: 'Legends Sedan',
    model: model('sedan.glb'),
    // Part names match the real Sketchfab sedan. Its paint materials are the 13th and 19th
    // in its material list; put their names here once the real file is inspected.
    paintMaterials: ['BODY PAINT', 'FRONT END PAINT'],
    categories: [
      {
        id: 'body',
        title: 'Body Style',
        leadKey: 'body',
        anchor: [0.62, 0.62, 1.0],
        options: [
          { id: 'ford37', label: '37 Ford', node: '37 FORD SEDAN BODY', thumb: thumb('37FordSBody.png') },
          { id: 'ford34', label: '34 Ford', node: '34 FORD SEDAN BODY', thumb: thumb('34FordSBody.png') },
          { id: 'chevy37', label: '37 Chevy', node: '37 CHEVY SEDAN BODY', thumb: thumb('37ChevySBody.png') },
        ],
      },
      LEGENDS_FRONT_ENDS,
      LEGENDS_WHEELS,
      LEGENDS_TIRES,
      LEGENDS_EXHAUSTS,
    ],
    camera: { ...CAMERA },
  },
];

/** Which tab is open when the page loads. */
export const DEFAULT_CAR_ID = 'coupe';

/** First option in each category is the default. */
export function defaultSelections(car) {
  return Object.fromEntries(car.categories.map((c) => [c.id, c.options[0].id]));
}
