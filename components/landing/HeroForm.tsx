"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Paste the prospect URL right on the landing page; /new prefills it and starts research. */
export default function HeroForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [offering, setOffering] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = new URLSearchParams({ url, offering, go: offering ? "1" : "" });
        router.push(`/new?${q}`);
      }}
      className="flex w-full max-w-[560px] flex-col gap-2"
    >
      <input
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste your prospect’s website, e.g. linear.app"
        className="rounded-full border border-line bg-white px-6 py-4 text-base outline-none transition focus:border-ink"
      />
      <div className="flex items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-6 transition focus-within:border-ink">
        <input
          value={offering}
          onChange={(e) => setOffering(e.target.value)}
          placeholder="What you sell, in one line"
          className="min-w-0 flex-1 bg-transparent py-2.5 outline-none"
        />
        <button className="pill-dark shrink-0">
          Research it <span className="arrow">→</span>
        </button>
      </div>
    </form>
  );
}
