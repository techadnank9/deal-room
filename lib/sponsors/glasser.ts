// Glasser: company + people enrichment for the account brief.
// Real integration wired once docs are confirmed; mock returns an obviously-labelled estimate.

export function glasserEnabled() {
  return Boolean(process.env.GLASSER_API_KEY);
}

export type Enrichment = {
  employees?: string;
  funding?: string;
  techStack?: string[];
  likelyTitles?: string[];
  industry?: string;
};

export async function enrichCompany(domain: string): Promise<{ data: Enrichment; provider: string }> {
  void domain;
  return {
    data: {
      employees: "unknown (mock)",
      funding: "unknown (mock)",
      techStack: [],
      likelyTitles: ["CFO", "VP Engineering", "Head of Procurement"],
    },
    provider: "mock",
  };
}
