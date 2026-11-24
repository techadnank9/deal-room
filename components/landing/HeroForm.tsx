"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Enter your company URL; your AI team researches you and starts finding leads. */
export default function HeroForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/team?url=${encodeURIComponent(url.trim())}`);
      }}
      className="flex w-full max-w-[560px] items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-6 transition focus-within:border-ink"
    >
      <input
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Your company website, e.g. yourcompany.com"
        className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
      />
      <button className="pill-dark shrink-0">
        Find my leads <span className="arrow">→</span>
      </button>
    </form>
  );
}
