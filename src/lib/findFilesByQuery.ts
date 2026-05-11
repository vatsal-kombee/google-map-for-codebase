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

  const terms = q.split(/\s+/g).filter((t) => t.length > 1);
  const scored = filePaths.map((p) => {
    let score = calculateFileScore(p, terms);

    // 1. Category Boosts
    for (const cat of CATEGORY_RULES) {
      if (cat.keywords.some((k) => q.includes(k))) {
        if (cat.patterns.some((re) => re.test(p))) {
          score += 50;
        }
      }
    }

    // 2. Directory-membership boost
    for (const term of terms) {
      const segments = p.split(/[/\\]/);
      if (segments.some((seg) => seg.toLowerCase() === term)) {
        score += 100;
      }
    }

    return { p, score };
  });

  const matches = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.length - b.p.length);

  // Always respect the caller-specified limit — module-level callers pass a higher limit directly
  return matches.slice(0, limit).map((x) => x.p);
}

function calculateFileScore(path: string, terms: string[]): number {
  const lower = path.toLowerCase();
  let score = 0;

  // Term matches
  for (const t of terms) {
    if (lower.includes(t)) {
      score += 10;
      // Bonus for filename match vs path match
      const filename = path.split(/[/\\]/).pop()?.toLowerCase() || "";
      if (filename.includes(t)) score += 5;
    }
  }

  if (score === 0) return 0;

  // Core file bonuses
  if (lower.includes("index.")) score += 3;
  if (lower.includes("main.")) score += 3;
  if (lower.includes("app.")) score += 2;
  if (lower.includes("layout.")) score += 2;
  if (lower.includes("page.")) score += 2;
  if (lower.includes("route.")) score += 2;
  if (lower.includes("types.")) score += 1;

  // Deeply nested files get a slight penalty
  const depth = path.split(/[/\\]/).length;
  score -= depth * 0.5;

  return score;
}

