"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

/** Enter your website; onboarding at /start learns what you sell and proposes buyers. */
export default function HeroForm({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [url, setUrl] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = url.trim();
        if (!value) return;
        router.push(`/start?url=${encodeURIComponent(value)}`);
      }}
      className={`flex w-full max-w-[560px] flex-col gap-2 rounded-[28px] border p-1.5 transition sm:flex-row sm:items-center sm:rounded-full sm:pl-6 ${
        dark ? "border-white/15 bg-white/10 focus-within:border-white/60" : "border-line bg-white focus-within:border-ink"
      }`}
    >
      <label htmlFor={id} className="sr-only">
        Your company website
      </label>
      <input
        id={id}
        required
        type="text"
        inputMode="url"
        autoComplete="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="yourcompany.com"
        className={`min-w-0 flex-1 bg-transparent px-4 py-3 text-base outline-none sm:px-0 ${dark ? "text-white placeholder:text-white/50" : ""}`}
      />
      <button
        type="submit"
        className={`pill-dark shrink-0 justify-between ${dark ? "!bg-accent" : ""}`}
      >
        Find my buyers <span className="arrow" aria-hidden="true">→</span>
      </button>
    </form>
  );
}
