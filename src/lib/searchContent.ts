import { fetchFileCached, type FetchFileArgs } from "./fetchFileCached";
import { findFilesByQuery } from "./findFilesByQuery";
import { createLimiter } from "./concurrency";

export type SearchResult = {
  path: string;
  line: number;
  content: string;
};

export type SearchOptions = {
  caseSensitive?: boolean;
  isRegex?: boolean;
  limit?: number;
  signal?: AbortSignal;
};

const FETCH_CONCURRENCY = 15;

export async function searchContent(
  filePaths: string[],
  query: string,
  fetchArgsBuilder: (path: string) => FetchFileArgs,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { caseSensitive = false, isRegex = false, limit = 20, signal } = options;

  // Narrow candidates first when the file list is large
  let targetPaths = filePaths;
  if (filePaths.length > 50) {
    const likelyFiles = findFilesByQuery(filePaths, query, 50);
    const commonFiles = filePaths.filter(p => /index|main|app|layout|page/i.test(p)).slice(0, 10);
    targetPaths = [...new Set([...likelyFiles, ...commonFiles])];
  }

  let matcher: (text: string) => boolean;
  let lineMatcher: (line: string) => boolean;

  if (isRegex) {
    const re = new RegExp(query, caseSensitive ? "" : "i");
    matcher    = (text) => re.test(text);
    lineMatcher = (line) => re.test(line);
  } else {
    const q     = caseSensitive ? query : query.toLowerCase();
    matcher    = (text) => (caseSensitive ? text : text.toLowerCase()).includes(q);
    lineMatcher = (line) => (caseSensitive ? line : line.toLowerCase()).includes(q);
  }

  // Fetch all candidate files in parallel (up to FETCH_CONCURRENCY at a time)
  const limiter = createLimiter(FETCH_CONCURRENCY);

  const allHits = (
    await Promise.all(
      targetPaths.map((path) =>
        limiter(async (): Promise<SearchResult[]> => {
          if (signal?.aborted) return [];
          try {
            const content = await fetchFileCached({ ...fetchArgsBuilder(path), signal });
            if (!matcher(content)) return [];

            const lines = content.split("\n");
            const hits: SearchResult[] = [];
            for (let l = 0; l < lines.length; l++) {
              if (lineMatcher(lines[l])) {
                hits.push({ path, line: l + 1, content: lines[l].trim() });
              }
            }
            return hits;
          } catch {
            return [];
          }
        })
      )
    )
  ).flat();

  return allHits.slice(0, limit);
}
