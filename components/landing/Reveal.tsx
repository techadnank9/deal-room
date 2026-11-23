"use client";

import { useEffect, useRef, useState } from "react";

/** Fades a block up once when it enters the viewport. */
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:translate-y-0 ${
        shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Large statement whose words darken one at a time as they cross the middle of the screen. */
export function TaglineReveal({ lines }: { lines: string[] }) {
  const words = lines.flatMap((l, li) => l.split(" ").map((w, wi) => ({ w, br: wi === 0 && li > 0 })));
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lit, setLit] = useState<boolean[]>(() => words.map(() => false));

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = Number((e.target as HTMLElement).dataset.i);
          setLit((prev) => (prev[i] ? prev : prev.map((v, j) => (j === i ? true : v))));
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -42% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <p className="max-w-[680px] text-4xl font-semibold leading-tight tracking-tight text-balance md:text-6xl md:leading-none">
      {words.map(({ w, br }, i) => (
        <span key={i}>
          {br && <br className="hidden md:block" />}
          <span
            data-i={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${lit[i] ? "text-ink" : "text-ink/25"}`}
          >
            {w}
          </span>{" "}
        </span>
      ))}
    </p>
  );
}
