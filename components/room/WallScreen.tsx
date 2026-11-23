"use client";
/* eslint-disable react-hooks/immutability -- texture is updated imperatively */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ClaimCheck } from "@/lib/types";

export type ScreenBar = { id: string; label: string; color: string; value: number };

const W = 1024;
const H = 560;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines;
}

function draw(ctx: CanvasRenderingContext2D, bars: ScreenBar[], check: ClaimCheck | null) {
  ctx.fillStyle = "#0c1220";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#8b93a7";
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillText("CONVICTION", 40, 56);
  bars.forEach((b, i) => {
    const y = 90 + i * 70;
    ctx.fillStyle = b.color;
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText(b.label, 40, y + 32);
    ctx.fillStyle = "#27272a";
    ctx.fillRect(240, y + 6, 620, 34);
    ctx.fillStyle = b.color;
    ctx.fillRect(240, y + 6, (620 * Math.max(0, Math.min(100, b.value))) / 100, 34);
    ctx.fillStyle = "#fff";
    ctx.fillText(String(b.value), 890, y + 34);
  });
  ctx.fillStyle = "#3f3f46";
  ctx.fillRect(40, 312, W - 80, 2);
  ctx.fillStyle = "#8b93a7";
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillText("ANALYST FACT CHECK", 40, 358);
  if (!check) {
    ctx.fillStyle = "#71717a";
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText("Waiting for a claim with a number…", 40, 410);
    return;
  }
  const label = check.status === "contradicted" ? "BUSTED" : check.status.toUpperCase();
  const color = check.status === "verified" ? "#10b981" : check.status === "contradicted" ? "#ef4444" : "#f59e0b";
  ctx.font = "800 30px system-ui, sans-serif";
  const lw = ctx.measureText(label).width + 28;
  ctx.fillStyle = color;
  ctx.fillRect(40, 380, lw, 44);
  ctx.fillStyle = "#000";
  ctx.fillText(label, 54, 413);
  ctx.fillStyle = "#fff";
  ctx.font = "28px system-ui, sans-serif";
  wrap(ctx, check.claim, W - 80 - lw - 20, 2).forEach((l, i) => ctx.fillText(l, 60 + lw, 412 + i * 34));
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "24px system-ui, sans-serif";
  wrap(ctx, check.note, W - 80, 2).forEach((l, i) => ctx.fillText(l, 40, 492 + i * 30));
}

export default function WallScreen({
  bars,
  check,
  position = [0, 2.35, -2.95],
}: {
  bars: ScreenBar[];
  check: ClaimCheck | null;
  position?: [number, number, number];
}) {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, texture: t };
  }, []);

  const key = JSON.stringify([bars, check]);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw(ctx, bars, check);
    texture.needsUpdate = true;
    // key captures bars + check by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canvas, texture]);

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[2.6, 1.46, 0.06]} />
        <meshStandardMaterial color="#111" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[2.5, 1.37]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
