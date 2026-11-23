"use client";

import { useEffect, useState } from "react";

/** Pick any model: preset options from /api/models, or type a custom model id. */
export default function ModelPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (model: string) => void;
  compact?: boolean;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    fetch("/api/models", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { default: string; options: string[] }) => {
        setOptions(d.options);
        if (!value) onChange(d.default);
      })
      .catch(() => {});
    // load once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = value && !options.includes(value) ? [value, ...options] : options;
  const cls = compact
    ? "rounded-full border border-line bg-white/90 px-3 py-2 text-sm outline-none"
    : "rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink";

  if (custom) {
    return (
      <input
        autoFocus
        defaultValue={value}
        placeholder="model id, e.g. gpt-5.5"
        className={cls}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) onChange(v);
            setCustom(false);
          }
          if (e.key === "Escape") setCustom(false);
        }}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== value) onChange(v);
          setCustom(false);
        }}
      />
    );
  }

  return (
    <select
      aria-label="Model"
      value={value}
      onChange={(e) => (e.target.value === "__custom" ? setCustom(true) : onChange(e.target.value))}
      className={cls}
    >
      {list.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
      <option value="__custom">Other model…</option>
    </select>
  );
}
