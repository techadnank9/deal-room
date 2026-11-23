"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs -- Three objects are deliberately mutated inside the render loop */

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHARACTER_YAW, useCharacterModel } from "./models";
import type { Gesture } from "@/lib/types";

export type ExecState = "entering" | "listening" | "speaking" | "reacting" | "whispering" | "leaving" | "handshake" | "gone";
export type ExecutiveProps = {
  id: string;
  name: string;
  role: string;
  color: string;
  state: ExecState;
  gesture: Gesture;
  gestureUntil: number;
  target: [number, number];
  facing: number;
  start: [number, number];
  startDelay: number;
  conviction?: number;
  modelUrl?: string | null;
  showLabel?: boolean;
};
type BodyProps = ExecutiveProps & { walking: RefObject<boolean> };
const WALK_SPEED = 2.1;

/** Route around the table's clearance rectangle, including mid-walk verdict changes. */
function routeTo(x: number, z: number, tx: number, tz: number): [number, number][] {
  // Cross the doorway perpendicular to the wall, with room for shoulders.
  if (x > 4.25 && tx < 4.25) return [[4, 1.8], ...routeTo(4, 1.8, tx, tz)];
  if (tx > 4.25 && x < 4.25) return [...routeTo(x, z, 4, 1.8), [tx, tz]];
  const left = -1.95, right = 1.95, back = -1.67, front = 0.15;
  if (z >= back && z <= front && x >= right) {
    return [[right + 0.1, tz < back ? back - 0.15 : front + 0.15], [tx, tz]];
  }
  if (z >= back && z <= front && x <= left) {
    return [[left - 0.1, tz < back ? back - 0.15 : front + 0.15], [tx, tz]];
  }
  if ((z < back && tz > front) || (z > front && tz < back)) {
    const side = tx > right ? right + 0.1 : x > 0.3 ? right + 0.1 : left - 0.1;
    return [[side, z < back ? back - 0.15 : front + 0.15], [side, tz < back ? back - 0.15 : front + 0.15], [tx, tz]];
  }
  return [[tx, tz]];
}

function useWalker(props: ExecutiveProps, group: RefObject<THREE.Group | null>) {
  const born = useRef<number | null>(null);
  const elapsed = useRef(0);
  const walking = useRef(false);
  const route = useRef<[number, number][]>([]);
  const destination = useRef("");
  useLayoutEffect(() => { born.current = performance.now(); elapsed.current = 0; }, []);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const now = performance.now();
    if (born.current === null) born.current = now;
    const activeTime = Math.max(0, (now - born.current - props.startDelay) / 1000);
    let remaining = WALK_SPEED * Math.max(0, activeTime - elapsed.current);
    elapsed.current = activeTime;
    const waiting = now - born.current < props.startDelay;
    const key = `${props.target[0]},${props.target[1]}`;
    if (key !== destination.current) {
      route.current = routeTo(g.position.x, g.position.z, ...props.target);
      destination.current = key;
    }
    let yaw = props.facing;
    // Spend the entire elapsed-time distance, even across corners on a slow frame.
    // Capping delta here made the entrance take much longer on slower GPUs.
    while (!waiting && route.current.length > 0) {
      const goal = route.current[0];
      const dx = goal[0] - g.position.x, dz = goal[1] - g.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > remaining) {
        g.position.x += dx / distance * remaining;
        g.position.z += dz / distance * remaining;
        yaw = Math.atan2(dx, dz);
        break;
      }
      g.position.set(goal[0], 0, goal[1]);
      remaining -= distance;
      route.current.shift();
    }
    walking.current = !waiting && route.current.length > 0;
    const diff = Math.atan2(Math.sin(yaw - g.rotation.y), Math.cos(yaw - g.rotation.y));
    g.rotation.y += diff * (1 - Math.exp(-delta * 9));
    g.visible = props.state !== "gone" && !(props.state === "leaving" && !walking.current && route.current.length <= 1);
  });
  return walking;
}

// Unit geometries shared by every fallback person. Individual meshes only scale them.
const sphere = new THREE.SphereGeometry(1, 20, 14);
const box = new THREE.BoxGeometry(1, 1, 1);
const taper = new THREE.CylinderGeometry(0.82, 1, 1, 12);
const jacketShape = new THREE.CylinderGeometry(1, 0.78, 1, 12);
const hairShape = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);

type PartProps = { geometry?: THREE.BufferGeometry; material: THREE.Material; position?: [number, number, number]; scale: [number, number, number]; rotation?: [number, number, number] };
function Part({ geometry = sphere, ...props }: PartProps) {
  return <mesh {...props} geometry={geometry} castShadow receiveShadow dispose={null} />;
}

/** Tailored architectural figure with shoulder, elbow, hip and knee pivots. */
function TailoredBody(props: BodyProps) {
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null), elbowR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null), kneeR = useRef<THREE.Group>(null);
  const palette = useMemo(() => {
    const fabric = new THREE.Color(props.color).lerp(new THREE.Color("#4c5050"), 0.82).multiplyScalar(0.65);
    const skins: Record<string, string> = { cfo: "#c39375", tech: "#8e624c", procurement: "#d9ad8d", analyst: "#b88564" };
    return {
      jacket: new THREE.MeshStandardMaterial({ color: fabric, roughness: 0.92 }),
      trousers: new THREE.MeshStandardMaterial({ color: fabric.clone().multiplyScalar(0.72), roughness: 0.95 }),
      skin: new THREE.MeshStandardMaterial({ color: skins[props.id] ?? "#bd8e70", roughness: 0.8 }),
      shirt: new THREE.MeshStandardMaterial({ color: "#eee9de", roughness: 0.98 }),
      hair: new THREE.MeshStandardMaterial({ color: props.id === "cfo" ? "#68635c" : props.id === "procurement" ? "#433124" : "#24231f", roughness: 0.98 }),
      shoe: new THREE.MeshStandardMaterial({ color: "#292724", roughness: 0.58 }),
      detail: new THREE.MeshStandardMaterial({ color: "#433830", roughness: 0.9 }),
    };
  }, [props.color, props.id]);
  useEffect(() => () => Object.values(palette).forEach((m) => m.dispose()), [palette]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + props.id.length * 0.7;
    const g = performance.now() < props.gestureUntil ? props.gesture : "idle";
    const walking = props.walking.current;
    const wave = Math.sin(t * 8.5);
    const speak = props.state === "speaking";
    const crossed = !walking && g === "armsCrossed";
    const shake = !walking && props.state === "handshake";
    const whisper = !walking && (props.state === "whispering" || g === "whisper");
    const k = 1 - Math.exp(-delta * 9);
    function rotate(ref: RefObject<THREE.Group | null>, x: number, y = 0, z = 0) {
      if (!ref.current) return;
      const r = ref.current.rotation;
      r.x = THREE.MathUtils.lerp(r.x, x, k);
      r.y = THREE.MathUtils.lerp(r.y, y, k);
      r.z = THREE.MathUtils.lerp(r.z, z, k);
    }
    rotate(torso, !walking && (g === "leanIn" || whisper) ? 0.16 : 0, 0, walking ? wave * 0.018 : Math.sin(t * 0.8) * 0.008);
    if (torso.current) torso.current.position.y = 0.91 + (walking ? Math.abs(wave) * 0.018 : Math.sin(t * 1.7) * 0.003);
    rotate(head, !walking && g === "nod" ? Math.sin(t * 7) * 0.13 : speak ? Math.sin(t * 5) * 0.025 : 0,
      !walking && g === "headShake" ? Math.sin(t * 7) * 0.22 : whisper ? 0.12 : 0);
    rotate(armL, walking ? wave * 0.4 : crossed ? -0.55 : -0.04, crossed ? -0.35 : 0, crossed ? -0.22 : 0.06);
    rotate(armR, walking ? -wave * 0.4 : shake ? -1.05 + Math.sin(t * 6) * 0.035 : crossed ? -0.55 : speak ? -0.3 + Math.sin(t * 3) * 0.09 : -0.05,
      crossed ? 0.35 : 0, crossed ? 0.22 : -0.06);
    rotate(elbowL, crossed ? -1.4 : -0.12, 0, crossed ? -1.05 : 0);
    rotate(elbowR, shake ? -0.35 : crossed ? -1.45 : speak ? -0.85 : -0.12, 0, crossed ? 1.05 : 0);
    rotate(legL, walking ? -wave * 0.42 : 0);
    rotate(legR, walking ? wave * 0.42 : 0);
    rotate(kneeL, walking ? Math.max(0, wave) * 0.6 : 0.025);
    rotate(kneeR, walking ? Math.max(0, -wave) * 0.6 : 0.025);
  });

  return <group>
    {[{ x: -0.095, leg: legR, knee: kneeR }, { x: 0.095, leg: legL, knee: kneeL }].map(({ x, leg, knee }) => <group key={x} ref={leg} position={[x, 0.91, 0]}>
      <Part material={palette.trousers} geometry={taper} position={[0, -0.2, 0]} scale={[0.085, 0.4, 0.09]} />
      <group ref={knee} position={[0, -0.4, 0]}>
        <Part material={palette.trousers} geometry={jacketShape} position={[0, -0.19, 0]} scale={[0.07, 0.39, 0.073]} />
        <Part material={palette.shoe} position={[0, -0.45, 0.045]} scale={[0.075, 0.055, 0.145]} />
        <Part material={palette.shoe} geometry={box} position={[0, -0.482, 0.045]} scale={[0.135, 0.018, 0.25]} />
      </group>
    </group>)}
    <group ref={torso} position={[0, 0.91, 0]}>
      <Part material={palette.trousers} position={[0, 0.01, 0]} scale={[0.177, 0.14, 0.105]} />
      <Part material={palette.jacket} geometry={jacketShape} position={[0, 0.275, 0]} scale={[0.22, 0.51, 0.12]} />
      <Part material={palette.shirt} geometry={box} position={[0, 0.407, 0.105]} scale={[0.115, 0.22, 0.024]} />
      {[-1, 1].map((side) => <group key={side}>
        <Part material={palette.shirt} geometry={box} position={[side * 0.045, 0.51, 0.08]} scale={[0.075, 0.06, 0.035]} rotation={[0, 0, side * 0.35]} />
        <Part material={palette.jacket} geometry={box} position={[side * 0.084, 0.376, 0.119]} scale={[0.066, 0.245, 0.018]} rotation={[0, 0, -side * 0.32]} />
      </group>)}
      {[0.16, 0.245].map((y) => <Part key={y} material={palette.detail} position={[0.018, y, 0.119]} scale={[0.008, 0.008, 0.004]} />)}
      <Part material={palette.skin} geometry={taper} position={[0, 0.565, 0]} scale={[0.055, 0.1, 0.055]} />
      <group ref={head} position={[0, 0.69, 0]}>
        <Part material={palette.skin} scale={[0.105, 0.137, 0.104]} />
        <Part material={palette.skin} position={[0, -0.065, 0.025]} scale={[0.077, 0.068, 0.075]} />
        <Part material={palette.skin} position={[0, -0.005, 0.101]} scale={[0.018, 0.033, 0.026]} />
        {[-1, 1].map((side) => <group key={side}>
          <Part material={palette.skin} position={[side * 0.103, -0.005, 0]} scale={[0.019, 0.034, 0.018]} />
          <Part material={palette.detail} position={[side * 0.04, 0.024, 0.095]} scale={[0.011, 0.0045, 0.004]} />
          <Part material={palette.hair} position={[side * 0.04, 0.043, 0.092]} scale={[0.023, 0.004, 0.005]} />
        </group>)}
        <Part material={palette.detail} position={[0, -0.049, 0.094]} scale={[0.024, 0.0025, 0.003]} />
        <Part material={palette.hair} geometry={hairShape} position={[0, 0.025, -0.008]} scale={[0.108, props.id === "tech" ? 0.143 : 0.124, 0.106]} rotation={[0, 0, props.id === "cfo" ? -0.1 : 0.09]} />
        {props.id === "procurement" && <Part material={palette.hair} position={[0, -0.045, -0.09]} scale={[0.103, 0.15, 0.053]} />}
        {props.id === "analyst" && <Part material={palette.hair} position={[0, 0.06, -0.12]} scale={[0.059, 0.057, 0.054]} />}
      </group>
      {[{ x: 0.225, arm: armL, elbow: elbowL }, { x: -0.225, arm: armR, elbow: elbowR }].map(({ x, arm, elbow }) => <group key={x} ref={arm} position={[x, 0.47, 0]}>
        <Part material={palette.jacket} scale={[0.075, 0.082, 0.085]} />
        <Part material={palette.jacket} geometry={jacketShape} position={[0, -0.13, 0]} scale={[0.066, 0.26, 0.072]} />
        <group ref={elbow} position={[0, -0.27, 0]}>
          <Part material={palette.jacket} scale={[0.052, 0.057, 0.057]} />
          <Part material={palette.jacket} geometry={jacketShape} position={[0, -0.115, 0]} scale={[0.052, 0.23, 0.055]} />
          <Part material={palette.shirt} geometry={taper} position={[0, -0.234, 0]} scale={[0.042, 0.026, 0.043]} />
          <Part material={palette.skin} position={[0, -0.29, 0.009]} scale={[0.037, 0.067, 0.024]} />
          <Part material={palette.skin} position={[-Math.sign(x) * 0.033, -0.274, 0.022]} scale={[0.014, 0.034, 0.018]} />
        </group>
      </group>)}
    </group>
  </group>;
}

function GLBBody(props: BodyProps & { url: string }) {
  // Explicitly disable drei's CDN Draco decoder. These local assets are uncompressed.
  const { scene, animations } = useGLTF(props.url, false, false);
  const rig = useMemo(() => {
    if (!animations.length) throw new Error("Character has no animation clips");
    const model = cloneSkinned(scene);
    const bones: Record<string, THREE.Bone> = {};
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name.toLowerCase().replace(/[^a-z]/g, "")] = o as THREE.Bone;
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Skinned bounds in these exports don't describe the animated surface.
        o.frustumCulled = false;
      }
    });
    const find = (...names: string[]) => Object.entries(bones).find(([key]) => names.some((name) => key === name || key.endsWith(name)))?.[1];
    const head = find("head", "neck"), spine = find("spine", "spineone", "chest");
    const leftArm = find("leftarm", "leftupperarm"), rightArm = find("rightarm", "rightupperarm");
    const leftFore = find("leftforearm", "leftlowerarm"), rightFore = find("rightforearm", "rightlowerarm");
    const controlled = [...new Set([head, spine, leftArm, rightArm, leftFore, rightFore].filter((b): b is THREE.Bone => !!b))];
    const base = controlled.map((b) => b.quaternion.clone());
    const idle = animations.find((a) => a.name.toLowerCase() === "idle") ?? animations[0];
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const original of animations) {
      const clip = original.clone();
      // Some finger-wag clips only key half the rig. Fill unkeyed channels with
      // idle so a crossfade never exposes the imported T-pose.
      const keyed = new Set(clip.tracks.map((track) => track.name));
      for (const track of idle?.tracks ?? []) if (!keyed.has(track.name)) clip.tracks.push(track.clone());
      // Movement belongs to useWalker; keep vertical hip motion but remove drift.
      for (const track of clip.tracks) if (/hips\.position$/i.test(track.name)) {
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i] = track.values[0];
          track.values[i + 2] = track.values[2];
        }
      }
      actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
    }
    return { model, mixer, actions, idleName: idle?.name.toLowerCase() ?? "", controlled, base, head, spine, leftArm, rightArm, leftFore, rightFore };
  }, [scene, animations]);
  const current = useRef<THREE.AnimationAction | null>(null);
  const reaction = useRef({ key: "", started: 0 });
  const layer = useRef({ handshake: 0, crossed: 0, lean: 0, whisper: 0 });
  const scratch = useMemo(() => ({ q: new THREE.Quaternion(), parent: new THREE.Quaternion(), world: new THREE.Quaternion(), delta: new THREE.Quaternion(), direction: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), euler: new THREE.Euler() }), []);
  useEffect(() => {
    const idle = rig.actions[rig.idleName];
    idle?.reset().play();
    rig.mixer.update(0);
    rig.controlled.forEach((bone, i) => rig.base[i].copy(bone.quaternion));
    current.current = idle ?? null;
    // Only stop: the memoised rig is reused when React re-runs this effect (Strict Mode),
    // and uncaching here would leave actions the next run plays without a cache index.
    return () => {
      rig.mixer.stopAllAction();
    };
  }, [rig]);

  useFrame(({ clock }, delta) => {
    const now = performance.now(), t = clock.elapsedTime;
    const gesture = now < props.gestureUntil ? props.gesture : "idle";
    const key = `${gesture}:${props.gestureUntil}`;
    const newReaction = reaction.current.key !== key;
    if (newReaction) reaction.current = { key, started: now };
    const age = (now - reaction.current.started) / 1000;
    const walking = props.walking.current;
    const procedural = props.state === "handshake" || props.state === "whispering" || ["armsCrossed", "leanIn", "whisper"].includes(gesture);
    let name = "idle";
    if (walking) name = "walk";
    else if (!procedural && (gesture === "nod" || gesture === "headShake") && age < 2.5) name = gesture.toLowerCase();
    else if (!procedural && props.state === "speaking") name = "talk";
    const next = rig.actions[name] ?? rig.actions[rig.idleName] ?? Object.values(rig.actions)[0];
    if (next && next === current.current && newReaction && (name === "nod" || name === "headshake")) next.reset().play();
    if (next && next !== current.current) {
      next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
      next.setLoop(name === "nod" || name === "headshake" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = true;
      next.play();
      if (current.current) next.crossFadeFrom(current.current, 0.3, false);
      current.current = next;
    }
    // Restore the previous frame's unmodified pose before the mixer samples again.
    rig.controlled.forEach((bone, i) => bone.quaternion.copy(rig.base[i]));
    rig.mixer.update(Math.min(delta, 0.05));
    rig.controlled.forEach((bone, i) => rig.base[i].copy(bone.quaternion));
    const k = 1 - Math.exp(-delta * 8);
    layer.current.handshake = THREE.MathUtils.lerp(layer.current.handshake, !walking && props.state === "handshake" ? 1 : 0, k);
    layer.current.crossed = THREE.MathUtils.lerp(layer.current.crossed, !walking && gesture === "armsCrossed" ? 1 : 0, k);
    layer.current.lean = THREE.MathUtils.lerp(layer.current.lean, !walking && gesture === "leanIn" ? 1 : 0, k);
    layer.current.whisper = THREE.MathUtils.lerp(layer.current.whisper, !walking && (props.state === "whispering" || gesture === "whisper") ? 1 : 0, k);
    const weights = layer.current;
    function offset(bone: THREE.Bone | undefined, x: number, y = 0) {
      if (bone) bone.quaternion.multiply(scratch.q.setFromEuler(scratch.euler.set(x, y, 0)));
    }
    offset(rig.spine, weights.lean * 0.16 + weights.whisper * 0.12);
    offset(rig.head, !walking && props.state === "speaking" ? Math.sin(t * 5.5) * 0.025 : props.id === "analyst" && gesture === "nod" && age >= 2.5 ? Math.sin(t * 4) * 0.055 : 0, weights.whisper * 0.1);
    // Aim a bone's +Y axis in model space, preserving its animated twist. This
    // avoids assuming that Meshy arm bones share the fallback's local axes.
    function aim(bone: THREE.Bone | undefined, x: number, y: number, z: number, weight: number) {
      if (!bone || weight < 0.001) return;
      rig.model.getWorldQuaternion(scratch.q);
      scratch.direction.set(x, y, z).normalize().applyQuaternion(scratch.q);
      bone.getWorldQuaternion(scratch.world);
      scratch.up.set(0, 1, 0).applyQuaternion(scratch.world);
      scratch.delta.setFromUnitVectors(scratch.up, scratch.direction);
      scratch.world.premultiply(scratch.delta);
      bone.parent!.getWorldQuaternion(scratch.parent).invert();
      scratch.world.premultiply(scratch.parent);
      bone.quaternion.slerp(scratch.world, weight);
      bone.updateWorldMatrix(false, true);
    }
    aim(rig.leftArm, -0.25, -0.8, 0.5, weights.crossed);
    aim(rig.rightArm, 0.25, -0.8, 0.5, weights.crossed);
    aim(rig.leftFore, -0.95, 0.12, 0.12, weights.crossed);
    aim(rig.rightFore, 0.95, 0.18, 0.16, weights.crossed);
    aim(rig.rightArm, -0.12, -0.5, 0.85, weights.handshake);
    aim(rig.rightFore, 0.04, Math.sin(t * 6) * 0.04, 1, weights.handshake);
  });

  // Exported skin vertices are already metres; Armature scale is part of binding.
  return <group rotation-y={CHARACTER_YAW[props.id] ?? 0} scale={1}><primitive object={rig.model} dispose={null} /></group>;
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function Executive(props: ExecutiveProps) {
  const group = useRef<THREE.Group>(null);
  const initial = useRef<[number, number, number]>([props.start[0], 0, props.start[1]]);
  const walking = useWalker(props, group);
  const modelUrl = useCharacterModel(props.modelUrl);
  const fallback = <TailoredBody {...props} walking={walking} />;
  return <group ref={group} position={initial.current}>
    {modelUrl ? <ModelBoundary key={modelUrl} fallback={fallback}><Suspense fallback={fallback}><GLBBody {...props} url={modelUrl} walking={walking} /></Suspense></ModelBoundary> : fallback}
    {props.showLabel !== false && <NameTag name={props.name} sub={`${props.role}${props.conviction !== undefined ? ` · ${props.conviction}` : ""}`} color={props.color} />}
  </group>;
}

function NameTag({ name, sub, color }: { name: string; sub: string; color: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 144;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(250,248,243,0.96)";
    ctx.beginPath(); ctx.roundRect(10, 10, 492, 124, 32); ctx.fill();
    ctx.strokeStyle = "rgba(66,58,47,0.12)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(42, 51, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#272b29"; ctx.font = "500 33px system-ui, sans-serif";
    ctx.fillText(name, 64, 62, 410);
    ctx.fillStyle = "#76766c"; ctx.font = "25px system-ui, sans-serif";
    ctx.fillText(sub, 64, 105, 410);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [name, sub, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[0, 2.09, 0]} scale={[0.79, 0.222, 1]} renderOrder={10}>
    <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
  </sprite>;
}
