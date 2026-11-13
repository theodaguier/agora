export type WikiNodeType = "entity" | "concept" | "comparison" | "query" | "session" | "raw" | "agent" | "ghost";
export type WikiNode = { id: string; label: string; type: WikiNodeType; updated?: string; tags?: string[]; summary?: string };
export type WikiEdge = { source: string; target: string };

/** Node colors on the dark theme, reused in the legend (and in the vault's .obsidian/graph.json). */
const NODE_COLORS: Record<WikiNodeType, string> = {
  // Quiet tones, as Obsidian's: the kinds told apart without the greens and blues shouting.
  agent: "#ededed",
  entity: "#8fc4a0",
  concept: "#9b9ba0",
  comparison: "#b3a7df",
  query: "#d9a37a",
  session: "#8aa9e0",
  raw: "#55565b",
  ghost: "#c9bd7f",
};

/** Light theme: the near-white and light-gray nodes would vanish on a white background. */
const LIGHT_OVERRIDES: Partial<Record<WikiNodeType, string>> = { agent: "#262626", concept: "#8a8a8a" };

export const nodeColor = (type: WikiNodeType, dark: boolean) => (dark ? NODE_COLORS[type] : (LIGHT_OVERRIDES[type] ?? NODE_COLORS[type]));

