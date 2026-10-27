/**
 * Web materials for the Legend Cars Cinema 4D scene.
 *
 * The artist's scene uses Octane render materials, which don't export to glTF. The second
 * export pass (export_pass2_materials.py) keeps each material's name as "NN Name", where NN is
 * its position in the Cinema 4D material list, and saves a preview of every one. This table
 * maps those numbers to web (PBR) materials matched by eye to the previews.
 *
 * color: linear RGB 0..1 · metal/rough: 0..1 · alpha < 1 makes it see-through
 * clearcoat: lacquer layer (paint) · paint: true marks the material the color picker changes
 */
export const WEB_MATERIALS = {
  'BODY PAINT': { color: [0.8, 0.8, 0.8], metal: 0.0, rough: 0.3, clearcoat: 1, paint: true },
  'BLACK GLOSS': { color: [0.02, 0.02, 0.02], metal: 0.3, rough: 0.28 },
  'DARK MATTE': { color: [0.05, 0.05, 0.05], metal: 0.0, rough: 0.8 },
  'DARK SATIN': { color: [0.12, 0.12, 0.12], metal: 0.2, rough: 0.5 },
  'TIRE RUBBER': { color: [0.035, 0.035, 0.035], metal: 0.0, rough: 0.88 },
  'TIRE SIDEWALL': { color: [0.04, 0.04, 0.04], metal: 0.0, rough: 0.85, tireTextures: true },
  'BRUSHED ALUMINUM': { color: [0.78, 0.78, 0.79], metal: 1.0, rough: 0.35 },
  'DARK ALUMINUM': { color: [0.22, 0.22, 0.22], metal: 1.0, rough: 0.38 },
  'POLISHED ALUMINUM': { color: [0.9, 0.9, 0.91], metal: 1.0, rough: 0.15 },
  STAINLESS: { color: [0.7, 0.71, 0.72], metal: 1.0, rough: 0.22 },
  CHROME: { color: [0.85, 0.85, 0.86], metal: 1.0, rough: 0.12 },
  'CAST IRON': { color: [0.42, 0.43, 0.44], metal: 1.0, rough: 0.55 },
  'EXHAUST STEEL': { color: [0.55, 0.55, 0.55], metal: 1.0, rough: 0.4 },
  'DIRTY STEEL': { color: [0.38, 0.37, 0.35], metal: 1.0, rough: 0.6 },
  'RUSTED METAL': { color: [0.3, 0.27, 0.24], metal: 0.7, rough: 0.7 },
  BRASS: { color: [0.78, 0.62, 0.36], metal: 1.0, rough: 0.35 },
  BRONZE: { color: [0.36, 0.31, 0.24], metal: 0.7, rough: 0.45 },
  GLASS: { color: [0.06, 0.07, 0.08], metal: 0.0, rough: 0.05, alpha: 0.35 },
  'AMBER LENS': { color: [0.85, 0.6, 0.25], metal: 0.0, rough: 0.15, alpha: 0.7 },
  'STRIPE YELLOW': { color: [1.0, 0.72, 0.04], metal: 0.0, rough: 0.3 },
  RED: { color: [0.8, 0.03, 0.03], metal: 0.0, rough: 0.3 },
  'ORANGE RED': { color: [0.6, 0.12, 0.05], metal: 0.0, rough: 0.3 },
  ORANGE: { color: [0.8, 0.3, 0.15], metal: 0.0, rough: 0.35 },
  MAGENTA: { color: [0.65, 0.05, 0.2], metal: 0.0, rough: 0.4 },
  MAROON: { color: [0.25, 0.03, 0.03], metal: 0.0, rough: 0.4 },
  BLUE: { color: [0.05, 0.25, 0.9], metal: 0.0, rough: 0.2 },
  'DEEP BLUE': { color: [0.05, 0.03, 0.7], metal: 0.0, rough: 0.2 },
  SLATE: { color: [0.3, 0.4, 0.55], metal: 0.0, rough: 0.5 },
  'WHITE GLOSS': { color: [0.9, 0.9, 0.9], metal: 0.0, rough: 0.2 },
  'WHITE MATTE': { color: [0.85, 0.85, 0.85], metal: 0.0, rough: 0.8 },
  'LIGHT GRAY': { color: [0.7, 0.7, 0.7], metal: 0.0, rough: 0.7 },
};

/** Cinema 4D material number -> web material. Unlisted numbers fall back to DARK MATTE. */
export const C4D_TO_WEB = {
  18: 'DARK SATIN', 25: 'DARK SATIN', // tex1
  19: 'BRUSHED ALUMINUM', 22: 'BRUSHED ALUMINUM', 31: 'BRUSHED ALUMINUM', 39: 'BRUSHED ALUMINUM', 61: 'BRUSHED ALUMINUM', 57: 'BRUSHED ALUMINUM',
  20: 'CAST IRON', 23: 'CAST IRON', 32: 'CAST IRON', 42: 'CAST IRON', 71: 'CAST IRON',
  21: 'BLACK GLOSS', 24: 'BLACK GLOSS', 40: 'BLACK GLOSS', 55: 'BLACK GLOSS', 74: 'BLACK GLOSS', 76: 'BLACK GLOSS',
  26: 'WHITE MATTE',
  27: 'TIRE SIDEWALL', 30: 'TIRE SIDEWALL',
  28: 'TIRE RUBBER', 29: 'TIRE RUBBER',
  33: 'STRIPE YELLOW',
  34: 'ORANGE RED',
  35: 'CHROME', 37: 'CHROME',
  36: 'DARK SATIN',
  38: 'GLASS', 56: 'GLASS',
  41: 'AMBER LENS', 66: 'AMBER LENS',
  43: 'BRONZE', 72: 'BRONZE',
  44: 'DARK ALUMINUM', 73: 'DARK ALUMINUM',
  45: 'BODY PAINT',
  47: 'POLISHED ALUMINUM', 49: 'POLISHED ALUMINUM', 50: 'POLISHED ALUMINUM',
  48: 'STAINLESS', 54: 'STAINLESS',
  51: 'RED', 75: 'RED',
  52: 'RUSTED METAL',
  53: 'BRASS',
  58: 'MAROON',
  59: 'LIGHT GRAY',
  60: 'DARK MATTE',
  62: 'BLUE',
  63: 'MAGENTA',
  64: 'DIRTY STEEL',
  65: 'EXHAUST STEEL',
  67: 'WHITE GLOSS',
  68: 'SLATE',
  69: 'ORANGE',
  70: 'DEEP BLUE',
};
