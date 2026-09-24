export type WikiNodeType = "entity" | "concept" | "comparison" | "query" | "session" | "raw" | "agent" | "ghost";
export type WikiNode = { id: string; label: string; type: WikiNodeType; updated?: string; tags?: string[]; summary?: string };
export type WikiEdge = { source: string; target: string };

/** Node colors on the dark theme, reused in the legend (and in the vault's .obsidian/graph.json). */
const NODE_COLORS: Record<WikiNodeType, string> = {
  agent: "#f5f5f5",
  entity: "#4ade80",
  concept: "#b8b8b8",
  comparison: "#c4b5fd",
  query: "#fb923c",
  session: "#60a5fa",
  raw: "#5c5c5c",
  ghost: "#e3d26f",
};

/** Light theme: the near-white and light-gray nodes would vanish on a white background. */
const LIGHT_OVERRIDES: Partial<Record<WikiNodeType, string>> = { agent: "#262626", concept: "#8a8a8a" };

export const nodeColor = (type: WikiNodeType, dark: boolean) => (dark ? NODE_COLORS[type] : (LIGHT_OVERRIDES[type] ?? NODE_COLORS[type]));

