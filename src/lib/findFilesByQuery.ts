const CATEGORY_RULES: Array<{
  name: string;
  keywords: string[];
  patterns: RegExp[];
}> = [
  {
    name: "auth",
    keywords: ["auth", "login", "logout", "jwt", "token", "session", "oauth"],
    patterns: [/auth/i, /login/i, /token/i, /session/i, /oauth/i]
  },
  {
    name: "api",
    keywords: ["api", "controller", "route", "router", "endpoint"],
    patterns: [/api/i, /route/i, /router/i, /controller/i]
  },
  {
    name: "db",
    keywords: ["db", "database", "model", "schema", "migration"],
    patterns: [/db/i, /model/i, /schema/i, /migration/i]
  },
  {
    name: "ui",
    keywords: ["ui", "component", "view", "page", "layout"],
    patterns: [/component/i, /view/i, /page/i, /layout/i]
  }
];

export function findFilesByQuery(filePaths: string[], query: string, limit = 20): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  for (const cat of CATEGORY_RULES) {
    if (cat.keywords.some((k) => q.includes(k))) {
      const hits = filePaths.filter((p) => cat.patterns.some((re) => re.test(p)));
      return hits.slice(0, limit);
    }
  }

  const terms = q.split(/\s+/g).filter(Boolean);
  const scored = filePaths
    .map((p) => {
      const lower = p.toLowerCase();
      const score = terms.reduce((acc, t) => acc + (lower.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.length - b.p.length);

  return scored.slice(0, limit).map((x) => x.p);
}

