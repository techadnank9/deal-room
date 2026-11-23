"use client";
/* eslint-disable react-hooks/immutability, react-hooks/purity, react-hooks/refs -- three.js objects are mutated per frame by design */

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Gesture } from "@/lib/types";

export type ExecState = "entering" | "listening" | "speaking" | "reacting" | "whispering" | "leaving" | "handshake" | "gone";

export type ExecutiveProps = {
  id: string;
  name: string;
  role: string;
  color: string;
  state: ExecState;
  gesture: Gesture;
  gestureUntil: number; // performance.now() ms
  target: [number, number]; // x, z the character walks to
  facing: number; // yaw (radians) once arrived
  start: [number, number];
  startDelay: number; // ms before starting to walk in
  conviction?: number;
  modelUrl?: string | null;
  showLabel?: boolean;
};

const WALK_SPEED = 1.5;

/** Shared movement: walks the group toward target, returns whether it is walking. */
function useWalker(props: ExecutiveProps, group: React.RefObject<THREE.Group | null>) {
  const born = useRef(performance.now());
  const walking = useRef(false);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const waiting = performance.now() - born.current < props.startDelay;
    const tx = waiting ? props.start[0] : props.target[0];
    const tz = waiting ? props.start[1] : props.target[1];
    const dx = tx - g.position.x;
    const dz = tz - g.position.z;
    const dist = Math.hypot(dx, dz);
    let yaw: number;
    if (dist > 0.04) {
      const step = Math.min(dist, WALK_SPEED * Math.min(dt, 0.05));
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      yaw = Math.atan2(dx, dz);
      walking.current = true;
    } else {
      yaw = props.facing;
      walking.current = false;
    }
    let diff = yaw - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, dt * 8);
    // fade out once gone
    g.visible = !(props.state === "leaving" && !walking.current && performance.now() - born.current > 3000);
  });
  return walking;
}

function CapsuleBody(props: ExecutiveProps & { walking: React.RefObject<boolean> }) {
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const now = performance.now();
    const gestureOn = now < props.gestureUntil;
    const g = gestureOn ? props.gesture : "idle";
    const walking = props.walking.current;
    const k = Math.min(1, dt * 6);

    // defaults
    let torsoX = 0;
    let torsoZ = 0;
    let headX = 0;
    let headY = 0;
    let armLX = 0;
    let armRX = 0;
    let armLZ = 0.12;
    let armRZ = -0.12;
    let bob = 0;

    if (walking) {
      bob = Math.abs(Math.sin(t * 9)) * 0.05;
      armLX = Math.sin(t * 9) * 0.5;
      armRX = -Math.sin(t * 9) * 0.5;
    } else {
      bob = Math.sin(t * 1.6 + props.id.length) * 0.008; // breathing
      if (props.state === "speaking") {
        headX = Math.sin(t * 7) * 0.06;
        armRX = -0.5 + Math.sin(t * 4) * 0.25;
      }
      if (g === "nod") headX = Math.sin(t * 9) * 0.28;
      if (g === "headShake") headY = Math.sin(t * 11) * 0.4;
      if (g === "armsCrossed") {
        armLX = -1.3;
        armRX = -1.3;
        armLZ = -0.9;
        armRZ = 0.9;
      }
      if (g === "leanIn") torsoX = 0.28;
      if (props.state === "whispering" || g === "whisper") {
        torsoZ = 0.25;
        headY = 0.3;
      }
      if (props.state === "handshake") {
        armRX = -1.35;
        armRZ = -0.05;
        armRX += Math.sin(t * 8) * 0.08;
      }
    }

    if (torso.current) {
      torso.current.rotation.x += (torsoX - torso.current.rotation.x) * k;
      torso.current.rotation.z += (torsoZ - torso.current.rotation.z) * k;
      torso.current.position.y = bob;
    }
    if (head.current) {
      head.current.rotation.x += (headX - head.current.rotation.x) * Math.min(1, dt * 14);
      head.current.rotation.y += (headY - head.current.rotation.y) * Math.min(1, dt * 14);
    }
    if (armL.current) {
      armL.current.rotation.x += (armLX - armL.current.rotation.x) * k;
      armL.current.rotation.z += (armLZ - armL.current.rotation.z) * k;
    }
    if (armR.current) {
      armR.current.rotation.x += (armRX - armR.current.rotation.x) * k;
      armR.current.rotation.z += (armRZ - armR.current.rotation.z) * k;
    }
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      const want = props.state === "speaking" ? 0.6 + Math.sin(t * 6) * 0.2 : 0;
      m.opacity += (want - m.opacity) * k;
    }
  });

  const skin = "#e8c4a6";
  return (
    <group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[0.38, 0.5, 40]} />
        <meshBasicMaterial color={props.color} transparent opacity={0} />
      </mesh>
      {/* legs */}
      <mesh position={[-0.1, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.7, 4, 12]} />
        <meshStandardMaterial color="#1f2430" />
      </mesh>
      <mesh position={[0.1, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.7, 4, 12]} />
        <meshStandardMaterial color="#1f2430" />
      </mesh>
      <group ref={torso} position={[0, 0, 0]}>
        <group position={[0, 0.95, 0]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <capsuleGeometry args={[0.22, 0.42, 6, 16]} />
            <meshStandardMaterial color={props.color} roughness={0.6} />
          </mesh>
          <group ref={armL} position={[-0.3, 0.55, 0]}>
            <mesh position={[0, -0.28, 0]} castShadow>
              <capsuleGeometry args={[0.065, 0.45, 4, 10]} />
              <meshStandardMaterial color={props.color} roughness={0.6} />
            </mesh>
          </group>
          <group ref={armR} position={[0.3, 0.55, 0]}>
            <mesh position={[0, -0.28, 0]} castShadow>
              <capsuleGeometry args={[0.065, 0.45, 4, 10]} />
              <meshStandardMaterial color={props.color} roughness={0.6} />
            </mesh>
          </group>
          <group ref={head} position={[0, 0.78, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.17, 24, 24]} />
              <meshStandardMaterial color={skin} roughness={0.7} />
            </mesh>
            {/* eyes so facing direction reads */}
            <mesh position={[-0.06, 0.03, 0.15]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[0.06, 0.03, 0.15]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#111" />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/** Rigged GLB character. Plays clips by name, falls back to idle when a clip is missing. */
function GLBBody(props: ExecutiveProps & { walking: React.RefObject<boolean>; url: string }) {
  const { scene, animations } = useGLTF(props.url);
  const model = useMemo(() => cloneSkinned(scene), [scene]);
  const root = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, root);
  const current = useRef<string>("");

  useFrame(() => {
    const now = performance.now();
    let clip = "idle";
    if (props.walking.current) clip = "walk";
    else if (props.state === "handshake") clip = "handshake";
    else if (props.state === "speaking") clip = "talk";
    else if (now < props.gestureUntil && props.gesture !== "idle") clip = props.gesture === "whisper" ? "leanIn" : props.gesture;
    if (!actions[clip]) clip = "idle";
    if (clip === current.current) return;
    const next = actions[clip] ?? Object.values(actions)[0];
    const prev = actions[current.current];
    prev?.fadeOut(0.25);
    next?.reset().fadeIn(0.25).play();
    current.current = clip;
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Executive(props: ExecutiveProps) {
  const group = useRef<THREE.Group>(null);
  const walking = useWalker(props, group);

  useEffect(() => {
    if (group.current) group.current.position.set(props.start[0], 0, props.start[1]);
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capsule = <CapsuleBody {...props} walking={walking} />;
  return (
    <group ref={group}>
      {props.modelUrl ? (
        <ModelBoundary fallback={capsule}>
          <Suspense fallback={capsule}>
            <GLBBody {...props} walking={walking} url={props.modelUrl} />
          </Suspense>
        </ModelBoundary>
      ) : (
        capsule
      )}
      {props.showLabel !== false && (
        <NameTag name={props.name} sub={`${props.role}${props.conviction !== undefined ? ` · ${props.conviction}` : ""}`} color={props.color} />
      )}
    </group>
  );
}

/** Name label as a canvas sprite: no DOM portals, always faces the camera. */
function NameTag({ name, sub, color }: { name: string; sub: string; color: string }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 112, 18);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.font = "700 44px system-ui, sans-serif";
    ctx.fillText(name, 256, 58);
    ctx.fillStyle = "#c4c4cc";
    ctx.font = "34px system-ui, sans-serif";
    ctx.fillText(sub, 256, 102);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [name, sub, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, 2.12, 0]} scale={[0.9, 0.225, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthWrite={false} depthTest={false} toneMapped={false} />
    </sprite>
  );
}
