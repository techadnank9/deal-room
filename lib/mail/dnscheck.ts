// Deliverability check for a sending domain: MX, SPF, DKIM (common selectors), DMARC.
// Gmail, Yahoo and Microsoft expect SPF + DKIM + DMARC (p=none at least) with an aligned From domain.
import { promises as dns } from "node:dns";

export type Check = { ok: boolean; label: string; detail: string; fix?: string };
export type DomainReport = { domain: string; checks: { mx: Check; spf: Check; dkim: Check; dmarc: Check }; allSet: boolean; toFix: number };

const SELECTORS = ["zmail", "google", "selector1", "selector2", "default", "k1", "s1", "s2", "dkim", "mail", "smtp", "zoho", "fm1", "protonmail", "resend", "mailo", "pm"];

async function txt(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

const cache = new Map<string, { at: number; r: DomainReport }>();

export async function checkDomain(emailOrDomain: string): Promise<DomainReport> {
  const domain = (emailOrDomain.includes("@") ? emailOrDomain.split("@")[1] : emailOrDomain).toLowerCase().trim();
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.r;

  const mxRecs = await dns.resolveMx(domain).catch(() => []);
  const mx: Check = mxRecs.length
    ? { ok: true, label: "Receives mail", detail: mxRecs.sort((a, b) => a.priority - b.priority).map((m) => m.exchange).slice(0, 2).join(", ") }
    : { ok: false, label: "Receives mail", detail: "No MX record, so replies can't reach you.", fix: "Add the MX records your email provider gives you." };

  const spfRec = (await txt(domain)).find((t) => t.toLowerCase().startsWith("v=spf1"));
  const spf: Check = spfRec
    ? { ok: true, label: "SPF", detail: spfRec }
    : { ok: false, label: "SPF", detail: "No SPF record.", fix: "Add a TXT record on the domain from your email provider, e.g. v=spf1 include:zohomail.com ~all." };

  let dkimSel = "";
  for (const s of SELECTORS) {
    if ((await txt(`${s}._domainkey.${domain}`)).some((t) => /p=/.test(t))) {
      dkimSel = s;
      break;
    }
  }
  const dkim: Check = dkimSel
    ? { ok: true, label: "DKIM", detail: `Signing key found (selector "${dkimSel}")` }
    : { ok: false, label: "DKIM", detail: "No signing key found on the usual selectors.", fix: "Turn on DKIM in your email provider's admin and add the TXT record it gives you." };

  const dmarcRec = (await txt(`_dmarc.${domain}`)).find((t) => t.toLowerCase().startsWith("v=dmarc1"));
  const policy = dmarcRec?.match(/p=(\w+)/i)?.[1]?.toLowerCase();
  const dmarc: Check = dmarcRec
    ? { ok: true, label: "DMARC", detail: `Policy: ${policy ?? "set"}${policy === "none" ? " (fine to start; move to quarantine after a few weeks of clean sending)" : ""}` }
    : { ok: false, label: "DMARC", detail: "No DMARC record.", fix: `Add a TXT record at _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:you@${domain}` };

  const checks = { mx, spf, dkim, dmarc };
  const toFix = Object.values(checks).filter((c) => !c.ok).length;
  const r = { domain, checks, allSet: toFix === 0, toFix };
  cache.set(domain, { at: Date.now(), r });
  return r;
}
