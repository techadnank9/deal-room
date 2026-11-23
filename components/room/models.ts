// One line per character: set a GLB path here to swap the capsule for a rigged model.
// Expected clips (any missing clip falls back to "idle"):
// walk, idle, talk, nod, headShake, armsCrossed, leanIn, handshake
export const CHARACTER_MODELS: Record<string, string | null> = {
  cfo: null, // "/models/cfo.glb"
  tech: null, // "/models/tech.glb"
  procurement: null, // "/models/procurement.glb"
  analyst: null, // "/models/analyst.glb"
};

// Props: set a path to replace the code-built placeholder.
export const PROP_MODELS: Record<string, string | null> = {
  table: null, // "/models/table.glb"
  wallScreen: null,
  plant: null,
  laptop: null,
};
