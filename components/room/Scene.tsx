"use client";
/* eslint-disable react-hooks/immutability, react-hooks/purity, react-hooks/refs -- three.js objects are mutated per frame by design */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import Executive, { type ExecState } from "./Executive";
import WallScreen from "./WallScreen";
import CameraRig from "./CameraRig";
import { CHARACTER_MODELS } from "./models";
import type { ClaimCheck, Gesture, Vote } from "@/lib/types";

export type SceneExec = {
  id: string;
  name: string;
  role: string;
  color: string;
  conviction: number;
};

export type SceneProps = {
  execs: SceneExec[];
  gestures: Record<string, Gesture>;
  gestureUntil: number;
  speaker: string | null;
  userTalking: boolean;
  whispers: { from: string; to: string }[];
  votes: Vote[] | null;
  check: ClaimCheck | null;
  analystBusy: boolean;
  backdropUrl?: string | null;
  /** Floor-to-ceiling glass across the whole back wall, with no stats screen (team room). */
  panorama?: boolean;
  /** Agent the human called by name: walks round the table to the front to talk to them. */
  approach?: string | null;
};

const SLOTS: Record<string, [number, number]> = {
  cfo: [-1.25, -1.55],
  tech: [0, -1.75],
  procurement: [1.25, -1.55],
};
const DOOR: [number, number] = [4.6, 1.8];
const EXIT: [number, number] = [5.8, 1.8];
const ANALYST_SPOT: [number, number] = [3.0, -2.3];

function execTargets(
  p: SceneProps,
  id: string,
  i: number,
): { state: ExecState; target: [number, number]; facing: number } {
  const slot = SLOTS[id] ?? [i - 1, -1.6];
  const vote = p.votes?.find((v) => v.id === id);
  if (vote) {
    if (vote.vote === "buy") {
      const buyers = p.votes!.filter((v) => v.vote === "buy").map((v) => v.id);
      const k = buyers.indexOf(id as (typeof buyers)[number]);
      return {
        state: "handshake",
        target: [(k - (buyers.length - 1) / 2) * 1.1, 1.3],
        facing: 0,
      };
    }
    return { state: "leaving", target: EXIT, facing: Math.PI / 2 };
  }
  if (p.approach === id)
    return {
      state: p.speaker === id ? "speaking" : "listening",
      target: [slot[0] * 0.45, 1.05],
      facing: 0,
    };
  // Whispers turn heads only; nobody leaves their place at the table.
  const w = p.whispers.find((x) => x.from === id);
  if (w && SLOTS[w.to]) {
    const to = SLOTS[w.to];
    const side = Math.sign(slot[0] - to[0]) || 1;
    return {
      state: "whispering",
      target: slot,
      facing: side > 0 ? -Math.PI / 2 : Math.PI / 2,
    };
  }
  if (p.whispers.some((x) => x.to === id)) {
    const from = p.whispers.find((x) => x.to === id)!.from;
    const side = Math.sign((SLOTS[from]?.[0] ?? 0) - slot[0]) || 1;
    return {
      state: "whispering",
      target: slot,
      facing: side > 0 ? Math.PI / 2 : -Math.PI / 2,
    };
  }
  if (p.speaker === id) return { state: "speaking", target: slot, facing: 0 };
  if (p.gestures[id] && p.gestures[id] !== "idle")
    return { state: "reacting", target: slot, facing: 0 };
  return { state: "listening", target: slot, facing: 0 };
}

function useSkylineTexture() {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#1b2a4a");
    grad.addColorStop(0.55, "#d9825b");
    grad.addColorStop(1, "#f3c08a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? "#3a3550" : "#1d1b2b";
      for (let x = 0; x < 1024;) {
        const w = 30 + rnd() * 70;
        const h = (layer === 0 ? 120 : 60) + rnd() * (layer === 0 ? 220 : 180);
        ctx.fillRect(x, 512 - h, w, h);
        if (layer === 1) {
          ctx.fillStyle = "#f8d58a";
          for (let wy = 512 - h + 10; wy < 500; wy += 18)
            for (let wx = x + 6; wx < x + w - 8; wx += 14)
              if (rnd() < 0.35) ctx.fillRect(wx, wy, 6, 8);
          ctx.fillStyle = "#1d1b2b";
        }
        x += w + 4;
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function Backdrop({ url }: { url: string }) {
  const tex = useTexture(url);
  return <meshBasicMaterial map={tex} toneMapped={false} />;
}

function MarbleMaterial() {
  const tex = useTexture("/backdrops/table-marble.jpg");
  return <meshStandardMaterial map={tex} roughness={0.18} metalness={0.05} />;
}

function Room({
  backdropUrl,
  panorama,
}: {
  backdropUrl?: string | null;
  panorama?: boolean;
}) {
  const skyline = useSkylineTexture();
  const wall = "#d9d4cc";
  return (
    <group>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial color="#6b5440" roughness={0.85} />
      </mesh>
      {/* rug */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, -0.6]} receiveShadow>
        <planeGeometry args={[5, 3.2]} />
        <meshStandardMaterial color="#2f3a4a" roughness={1} />
      </mesh>
      {/* ceiling */}
      <mesh rotation-x={Math.PI / 2} position={[0, 3.6, 0]}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial color="#efece6" />
      </mesh>
      {panorama ? (
        <>
          {/* back = one floor-to-ceiling window */}
          <mesh position={[0, 1.8, -3.52]}>
            <planeGeometry args={[9, 3.6]} />
            {backdropUrl ? (
              <Suspense
                fallback={
                  <meshBasicMaterial map={skyline} toneMapped={false} />
                }
              >
                <Backdrop url={backdropUrl} />
              </Suspense>
            ) : (
              <meshBasicMaterial map={skyline} toneMapped={false} />
            )}
          </mesh>
          {[-3, -1.5, 0, 1.5, 3].map((x) => (
            <mesh key={x} position={[x, 1.8, -3.48]}>
              <boxGeometry args={[0.05, 3.6, 0.05]} />
              <meshStandardMaterial color="#1c1c1c" />
            </mesh>
          ))}
          <mesh position={[0, 0.04, -3.48]}>
            <boxGeometry args={[9, 0.08, 0.06]} />
            <meshStandardMaterial color="#1c1c1c" />
          </mesh>
        </>
      ) : (
        <>
          {/* back = window wall */}
          <mesh position={[-3.0, 1.8, -3.5]}>
            <planeGeometry args={[3, 3.6]} />
            <meshStandardMaterial color={wall} />
          </mesh>
          <mesh position={[1.5, 0.35, -3.5]}>
            <planeGeometry args={[6, 0.7]} />
            <meshStandardMaterial color={wall} />
          </mesh>
          <mesh position={[1.5, 3.35, -3.5]}>
            <planeGeometry args={[6, 0.5]} />
            <meshStandardMaterial color={wall} />
          </mesh>
          <mesh position={[1.5, 1.85, -3.52]}>
            <planeGeometry args={[6, 2.3]} />
            {backdropUrl ? (
              <Suspense
                fallback={
                  <meshBasicMaterial map={skyline} toneMapped={false} />
                }
              >
                <Backdrop url={backdropUrl} />
              </Suspense>
            ) : (
              <meshBasicMaterial map={skyline} toneMapped={false} />
            )}
          </mesh>
          {/* window mullions */}
          {[-1.5, 0, 1.5, 3, 4.5].map((x) => (
            <mesh key={x} position={[x, 1.85, -3.48]}>
              <boxGeometry args={[0.06, 2.3, 0.05]} />
              <meshStandardMaterial color="#2a2a2a" />
            </mesh>
          ))}
        </>
      )}
      {/* left wall */}
      <mesh position={[-4.5, 1.8, 0.5]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[8, 3.6]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      {/* right wall with door gap */}
      <mesh position={[4.5, 1.8, -1.6]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[3.8, 3.6]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[4.5, 1.8, 3.4]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[2.2, 3.6]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[4.5, 3.1, 1.8]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[1.0, 1.0]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      {/* standing table */}
      <group position={[0, 0, -0.75]}>
        {panorama ? (
          <>
            {/* marble slab (Runware-generated texture) on brass panel legs */}
            <mesh position={[0, 1.04, 0]} castShadow receiveShadow>
              <boxGeometry args={[3.0, 0.08, 1.1]} />
              <Suspense
                fallback={
                  <meshStandardMaterial color="#efece6" roughness={0.25} />
                }
              >
                <MarbleMaterial />
              </Suspense>
            </mesh>
            <mesh position={[0, 0.985, 0]}>
              <boxGeometry args={[2.9, 0.03, 1.0]} />
              <meshStandardMaterial
                color="#b8913f"
                metalness={0.9}
                roughness={0.25}
              />
            </mesh>
            {[-1.15, 1.15].map((x) => (
              <mesh key={x} position={[x, 0.49, 0]} castShadow>
                <boxGeometry args={[0.07, 0.98, 0.8]} />
                <meshStandardMaterial
                  color="#b8913f"
                  metalness={0.9}
                  roughness={0.25}
                />
              </mesh>
            ))}
          </>
        ) : (
          <>
            <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.8, 0.06, 1.0]} />
              <meshStandardMaterial color="#3b2a1e" roughness={0.4} />
            </mesh>
            {[-1.1, 1.1].map((x) => (
              <mesh key={x} position={[x, 0.52, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.08, 1.04, 12]} />
                <meshStandardMaterial
                  color="#222"
                  metalness={0.6}
                  roughness={0.3}
                />
              </mesh>
            ))}
          </>
        )}
        {/* laptop */}
        <group position={[0.2, 1.09, 0.15]} rotation-y={-0.2}>
          <mesh>
            <boxGeometry args={[0.42, 0.02, 0.3]} />
            <meshStandardMaterial
              color="#9aa0a6"
              metalness={0.5}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0.14, -0.15]} rotation-x={-0.25}>
            <boxGeometry args={[0.42, 0.28, 0.015]} />
            <meshStandardMaterial
              color="#111"
              emissive="#1e3a8a"
              emissiveIntensity={0.4}
            />
          </mesh>
        </group>
        {/* cups */}
        {[-0.9, 0.95].map((x) => (
          <mesh key={x} position={[x, 1.13, 0.1]}>
            <cylinderGeometry args={[0.045, 0.04, 0.1, 16]} />
            <meshStandardMaterial color="#f5f5f4" />
          </mesh>
        ))}
        {/* contract */}
        <mesh position={[-0.4, 1.085, 0.25]} rotation-y={0.3}>
          <boxGeometry args={[0.22, 0.01, 0.3]} />
          <meshStandardMaterial color="#fafafa" />
        </mesh>
      </group>
      {/* plant */}
      <group position={[3.8, 0, -2.9]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.22, 0.17, 0.5, 16]} />
          <meshStandardMaterial color="#8b5e3c" />
        </mesh>
        <mesh position={[0, 0.85, 0]}>
          <sphereGeometry args={[0.45, 16, 16]} />
          <meshStandardMaterial color="#2f6b3a" roughness={0.9} />
        </mesh>
      </group>
      {/* chairs against left wall */}
      {[0.4, 1.4].map((z) => (
        <group key={z} position={[-4.0, 0, z]} rotation-y={Math.PI / 2}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.5, 0.06, 0.5]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <mesh position={[0, 0.75, -0.23]}>
            <boxGeometry args={[0.5, 0.6, 0.05]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Scene(p: SceneProps) {
  const focus = useMemo<[number, number] | null>(() => {
    if (p.votes || p.userTalking || !p.speaker) return null;
    if (p.approach && p.approach === p.speaker) {
      const slot =
        p.approach === "analyst"
          ? ([1.6 / 0.45, 0] as [number, number])
          : SLOTS[p.approach];
      return slot ? ([slot[0] * 0.45, 1.05] as [number, number]) : null;
    }
    if (p.speaker === "analyst") return ANALYST_SPOT;
    return SLOTS[p.speaker] ?? null;
  }, [p.votes, p.userTalking, p.speaker, p.approach]);

  return (
    <Canvas shadows camera={{ position: [0, 2.6, 5.6], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={["#f6f3ee"]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[3, 5, 3]}
        intensity={1.5}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Environment resolution={128}>
        <Lightformer
          intensity={2}
          position={[0, 4, -1]}
          scale={[6, 2, 1]}
          rotation-x={Math.PI / 2}
        />
        <Lightformer
          intensity={1.2}
          color="#f3c08a"
          position={[1.5, 1.8, -4]}
          scale={[6, 2.3, 1]}
        />
        <Lightformer
          intensity={0.6}
          position={[-5, 2, 0]}
          scale={[4, 3, 1]}
          rotation-y={Math.PI / 2}
        />
      </Environment>
      <CameraRig focus={focus} />
      <Room backdropUrl={p.backdropUrl} panorama={p.panorama} />
      {!p.panorama && (
        <WallScreen
          position={[-2.95, 2.15, -3.46]}
          bars={p.execs.map((e) => ({
            id: e.id,
            label: e.name.split(" ")[0],
            color: e.color,
            value: e.conviction,
          }))}
          check={p.check}
        />
      )}
      {p.execs.map((e, i) => {
        const t = execTargets(p, e.id, i);
        return (
          <Executive
            key={e.id}
            id={e.id}
            name={e.name}
            role={e.role}
            color={e.color}
            conviction={e.conviction}
            state={t.state}
            target={t.target}
            facing={t.facing}
            gesture={p.gestures[e.id] ?? "idle"}
            gestureUntil={p.gestureUntil}
            start={DOOR}
            startDelay={400 + i * 1100}
            modelUrl={CHARACTER_MODELS[e.id]}
          />
        );
      })}
      {/* Analyst: stands by the screen, nods while checking claims */}
      <Executive
        id="analyst"
        name="Analyst"
        role="fact checks"
        color="#f472b6"
        state={
          p.speaker === "analyst"
            ? "speaking"
            : p.analystBusy
              ? "reacting"
              : "listening"
        }
        target={p.approach === "analyst" ? [1.6, 1.05] : ANALYST_SPOT}
        facing={p.approach === "analyst" ? 0 : -0.5}
        gesture={p.analystBusy ? "nod" : "idle"}
        gestureUntil={p.analystBusy ? Number.MAX_SAFE_INTEGER : 0}
        start={ANALYST_SPOT}
        startDelay={0}
        modelUrl={CHARACTER_MODELS.analyst}
      />
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.5}
        scale={10}
        blur={2.5}
        far={4}
      />
    </Canvas>
  );
}
