export type WikiNodeType = "entity" | "concept" | "comparison" | "query" | "session" | "raw" | "agent" | "ghost";
export type WikiNode = { id: string; label: string; type: WikiNodeType; updated?: string; tags?: string[]; summary?: string };
export type WikiEdge = { source: string; target: string };
