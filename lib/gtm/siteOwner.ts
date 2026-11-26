// Owner of a small, newly launched site. Data providers have nothing on a product that went live last week,
// so read the site itself (home, about, contact, privacy, terms, imprint) for the founder's name and email,
// try the maker named on the launch post, and verify every address before anyone writes to it.
import { arr, llmJSON, obj, str } from "../llm";
import { findEmail, verifyEmail } from "../sponsors/glasser";
import type { Contact } from "./types";

const PAGES = ["", "/about", "/contact", "/privacy", "/privacy-policy", "/terms", "/imprint"];
const JUNK = /(example\.|sentry|wixpress|noreply|no-reply|donotreply|@2x|\.png|\.jpg|\.webp|\.svg|u003e|domain\.com|email\.com|yourcompany|privacy@|legal@|abuse@|dmca@|security@|careers@|jobs@|press@|gdpr@|dpo@)/i;
const GENERIC = /^(hello|hi|hey|contact|support|team|info|help|founders?|admin|mail)@/i;
const HOSTED = /\.(lovable\.app|bolt\.host|replit\.app|vercel\.app|netlify\.app|onrender\.com|framer\.website|webflow\.io|github\.io)$/i;

async function page(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DealRoom/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return "";
    return (await r.text()).slice(0, 300_000);
  } catch {
    return "";
  }
}

function textOf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findSiteOwner(domain: string, o: { company: string; maker?: string; context?: string }): Promise<Omit<Contact, "id">[]> {
  const host = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!host) return [];
  const htmls = await Promise.all(PAGES.map((p) => page(`https://${host}${p}`)));
  const emails = new Set<string>();
  for (const h of htmls) for (const m of h.matchAll(/(?:mailto:)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)) if (!JUNK.test(m[1])) emails.add(m[1].toLowerCase());
  const text = htmls.map(textOf).filter(Boolean).join("\n---\n").slice(0, 7000);
  const root = host.split(".").slice(-2).join(".");

  let owners: { name: string; title: string; email: string }[] = [];
  if (text) {
    const { data } = await llmJSON<{ owners: { name: string; title: string; email: string }[] }>({
      label: "site-owner",
      maxTokens: 400,
      system:
        "From a small product's own website, name the people who own or run it (founder, maker, CEO, operator). Use only names the text states; a legal entity's director in an imprint counts. title = their role as stated, or \"Founder\" if the site says it is made or run by them. email = the address the text ties to that person, else \"\". Return [] if no person is named.",
      user: `Product: ${o.company} (${host})${o.maker ? `\nLaunch post maker: ${o.maker}` : ""}${o.context ? `\nLaunch: ${o.context.slice(0, 300)}` : ""}\nEmails on the site: ${[...emails].join(", ") || "(none)"}\n\nSite text:\n${text}`,
      schema: obj({ owners: arr(obj({ name: str(), title: str(), email: str() })) }),
      mock: () => ({ owners: [] }),
    }).catch(() => ({ data: { owners: [] } }));
    owners = (data.owners ?? []).filter((x) => x.name?.trim()).slice(0, 2);
  }
  if (o.maker && !owners.some((x) => x.name.toLowerCase() === o.maker!.toLowerCase())) owners.push({ name: o.maker, title: "Founder", email: "" });

  const out: Omit<Contact, "id">[] = [];
  const used = new Set<string>();
  const add = async (name: string, title: string, email: string, conf: number) => {
    if (!email || used.has(email)) return;
    used.add(email);
    const v = await verifyEmail(email);
    if (v.status === "invalid") return;
    out.push({ name, title, email, emailStatus: v.status === "unknown" ? "mx-valid" : v.status, source: "site", confidence: v.status === "verified" ? 0.9 : conf });
  };
  for (const p of owners) {
    let email = p.email && !JUNK.test(p.email) ? p.email.toLowerCase() : "";
    if (!email && !HOSTED.test(host) && p.name.trim().includes(" ")) email = (await findEmail(p.name, root))?.email ?? "";
    await add(p.name.trim(), p.title || "Founder", email, 0.7);
  }
  // A solo founder's site usually lists one inbox (hello@, contact@) that the founder reads: use it under the owner's name.
  const owner = owners[0];
  const inbox = [...emails].filter((e) => e.endsWith(`@${root}`) || !HOSTED.test(host)).sort((a, b) => Number(!GENERIC.test(b)) - Number(!GENERIC.test(a)) || Number(b.endsWith(root)) - Number(a.endsWith(root)));
  for (const e of inbox.slice(0, 2)) if (out.length < 2) await add(owner?.name.trim() || `${o.company} founder`, owner?.title || "Founder (site contact)", e, 0.6);
  return out.slice(0, 3);
}
