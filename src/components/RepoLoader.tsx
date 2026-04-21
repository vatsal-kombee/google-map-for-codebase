"use client";

export function RepoLoader(props: {
  repoUrl: string;
  setRepoUrl: (v: string) => void;
  onExplore: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
      <input
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/40 md:w-[520px]"
        placeholder="Paste a public GitHub repo URL (e.g. https://github.com/vercel/next.js)"
        value={props.repoUrl}
        onChange={(e) => props.setRepoUrl(e.target.value)}
      />
      <button
        className="rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
        onClick={props.onExplore}
        disabled={props.loading || !props.repoUrl.trim()}
      >
        {props.loading ? "Loading…" : "Explore"}
      </button>
    </div>
  );
}

