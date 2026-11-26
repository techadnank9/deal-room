"use client";
// App frame: left sidebar (like the leading AI SDR tools), credits at the bottom.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePoll, type Gtm, type WorkspaceInfo } from "./ui";

const NAV: { href: string; label: string; icon: string; badge?: string }[] = [
  { href: "/app", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/app/agent", label: "Agent", icon: "M12 3v3m0 12v3M5 12H2m20 0h-3M7 7l-2-2m14 14-2-2M7 17l-2 2M19 5l-2 2M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" },
  { href: "/app/search", label: "Search", badge: "Beta", icon: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.3-4.3" },
  { href: "/app/contacts", label: "Contacts", icon: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 8v-1a3 3 0 0 0-2-2.8M17 5.2a3 3 0 0 1 0 5.6" },
  { href: "/app/inbox", label: "Inbox", icon: "M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" },
  { href: "/app/insights", label: "Insights", icon: "M4 19V5m0 14h16M8 15l3-4 3 2 4-6" },
  { href: "/app/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" },
  { href: "/app/mcp", label: "MCP", badge: "New", icon: "M8 9l-4 3 4 3m8-6 4 3-4 3M14 5l-4 14" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: me } = usePoll<WorkspaceInfo>("/api/workspace", 30000);
  const { data: gtm } = usePoll<Gtm>("/api/gtm", 15000);
  const review = gtm?.state.leads.filter((l) => l.sequence?.some((m) => m.approval === "pending")).length ?? 0;
  const left = me ? Math.max(0, me.plan.contactsPerMonth - me.usage.month.enrich) : null;
  const [menu, setMenu] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink md:flex-row">
      {/* Phones: top bar + slide-down menu instead of the sidebar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
        <Link href="/app" className="flex items-center gap-2 font-semibold">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <button onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menu" className="rounded-lg border border-line px-3 py-1.5 text-sm">
          {menu ? "Close" : `Menu${review ? ` · ${review}` : ""}`}
        </button>
      </div>
      {menu && (
        <nav className="z-20 border-b border-line bg-white px-3 pb-3 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
              <Icon d={n.icon} /> {n.label}
              {n.label === "Agent" && review > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{review}</span>}
            </Link>
          ))}
          <p className="px-3 pt-2 text-xs text-muted">{left ?? "…"} contacts left this month · {me?.plan.name}</p>
        </nav>
      )}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-4 md:flex">
        <Link href="/app" className="mb-6 flex items-center gap-2 px-2 text-[17px] font-semibold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <nav className="space-y-0.5">
          {NAV.map((n) => {
            const on = n.href === "/app" ? path === "/app" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${on ? "bg-accent/10 font-medium text-accent" : "text-ink/80 hover:bg-paper"}`}>
                <Icon d={n.icon} />
                <span className="flex-1">{n.label}</span>
                {n.badge && <span className="rounded-md bg-line/80 px-1.5 text-[10px] font-medium text-muted">{n.badge}</span>}
                {n.label === "Agent" && review > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{review}</span>}
              </Link>
            );
          })}
        </nav>
        <Link href="/team" className="mt-6 rounded-xl border border-line bg-paper/60 p-3 text-sm hover:border-ink">
          <span className="font-medium">Talk to your team</span>
          <span className="block text-xs text-muted">Ask Maya, Arjun or Elena by voice</span>
        </Link>
        <div className="mt-auto space-y-3 border-t border-line px-2 pt-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Contacts left this month</p>
            <p className="text-xl font-semibold tabular-nums">
              {left ?? "…"} <span className="text-xs font-normal text-muted">/ {me?.plan.contactsPerMonth ?? "…"}</span>
            </p>
            <p className="text-xs text-muted">{me ? `${me.plan.name} plan` : ""}{me?.workspace.plan === "trial" && me.workspace.trialEnds ? ` · ends ${new Date(me.workspace.trialEnds).toLocaleDateString()}` : ""}</p>
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="truncate">{me?.email}</span>
            <button
              className="hover:text-ink"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/";
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
