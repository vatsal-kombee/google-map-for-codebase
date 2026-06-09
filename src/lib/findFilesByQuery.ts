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

export function isModuleLevelQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /explain\s+.+module/.test(q) ||
    /how does\s+.+module/.test(q) ||
    /explain entire/.test(q) ||
    /walk me through/.test(q) ||
    /overview of/.test(q) ||
    /describe the\s+.+module/.test(q) ||
    /whole module/.test(q) ||
    /entire module/.test(q)
  );
}

export function findFilesByQuery(filePaths: string[], query: string, limit = 20): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (isModuleLevelQuery(query)) {
    // Extract target directory/module name
    // Find all unique directory segments from filePaths
    const allSegments = new Set<string>();
    for (const p of filePaths) {
      const parts = p.split(/[/\\]/);
      // Remove filename
      parts.pop();
      for (const part of parts) {
        if (part && part.toLowerCase() !== "src") {
          allSegments.add(part.toLowerCase());
        }
      }
    }

    // Find which segment is mentioned in the query
    const words = q.split(/[^a-zA-Z0-9_$]+/);
    let matchedDir: string | null = null;
    
    // Sort segments by length descending so longer matching segments take precedence
    const sortedSegments = [...allSegments].sort((a, b) => b.length - a.length);
    for (const seg of sortedSegments) {
      if (words.includes(seg)) {
        matchedDir = seg;
        break;
      }
    }

    if (matchedDir) {
      // Return ALL files in the matched directory (and its subdirectories)
      // bypass limit for module-level queries!
      const matchedFiles = filePaths.filter((p) => {
        const parts = p.split(/[/\\]/);
        parts.pop(); // remove filename
        return parts.some((part) => part.toLowerCase() === matchedDir);
      });
      if (matchedFiles.length > 0) {
        return matchedFiles;
      }
    }
  }

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

