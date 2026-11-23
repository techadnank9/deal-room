"use client";
/* eslint-disable react-hooks/immutability -- camera is moved per frame by design */

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

const WIDE_POS = new THREE.Vector3(0, 2.35, 5.2);
const WIDE_LOOK = new THREE.Vector3(0, 1.45, -1.2);

/** Wide shot by default; smooth move toward the current speaker; back to wide when the user talks. */
export default function CameraRig({ focus }: { focus: [number, number] | null }) {
  const { camera } = useThree();
  const look = useRef(WIDE_LOOK.clone());
  const wantPos = useRef(new THREE.Vector3());
  const wantLook = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    if (focus) {
      const [x, z] = focus;
      wantPos.current.set(x * 0.5, 2.1, z + 4.9);
      wantLook.current.set(x * 0.8, 1.5, z);
    } else {
      wantPos.current.copy(WIDE_POS);
      wantLook.current.copy(WIDE_LOOK);
    }
    const k = 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(wantPos.current, k);
    look.current.lerp(wantLook.current, k);
    camera.lookAt(look.current);
  });
  return null;
}
