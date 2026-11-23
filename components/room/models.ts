"use client";

import { useEffect, useState } from "react";

// Root-relative paths also work on /room/[id]. No external asset hosts or decoders.
export const CHARACTER_MODELS: Record<string, string | null> = {
  cfo: "/models/cfo.glb",
  tech: "/models/tech.glb",
  procurement: "/models/procurement.glb",
  analyst: "/models/analyst.glb",
};

// Meshy models face +Z, in metres. Adjust individual imports here, never via Box3.
export const CHARACTER_YAW: Record<string, number> = {
  cfo: 0,
  tech: 0,
  procurement: 0,
  analyst: 0,
};

const availability = new Map<string, Promise<string | null>>();
function availableModel(url: string) {
  let request = availability.get(url);
  if (!request) {
    request = fetch(url, { method: "HEAD" })
      .then((response) => response.status === 200 ? url : null)
      .catch(() => null);
    availability.set(url, request);
  }
  return request;
}

/** One HEAD per URL, including React Strict Mode remounts. */
export function useCharacterModel(url?: string | null) {
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (url) void availableModel(url).then((path) => { if (active) setResolved(path); });
    return () => { active = false; };
  }, [url]);
  return resolved === url ? resolved : null;
}

export const PROP_MODELS: Record<string, string | null> = {
  table: null,
  wallScreen: null,
  plant: null,
  laptop: null,
};
