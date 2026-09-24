import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** What the chat needs to draw brand logos (apps/web/src/lib/api.ts `Brands`). */
export type Brands = {
  /** logo.dev is set up: logos are served by the API (/integrations/logo). */
  logos: boolean;
  /** Known MCP servers, with the brand's domain when their URL gives it. */
  servers: Record<string, string | null>;
};

export const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: () => api<Brands>("/integrations/brands"),
  staleTime: 5 * 60_000,
});

/** MCP server of a tool reported by an agent ("mcp_pennylane_list_invoices" → "pennylane"), among the known ones. */
export function toolServer(tool: string, servers: string[]): string | null {
  const m = /^mcp_{1,2}(.+)$/i.exec(tool.trim());
  if (!m) return null;
  const rest = m[1]!.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "_");
  // Longest first: "google_calendar" before "google".
  return [...servers].sort((a, b) => b.length - a.length).find((s) => rest.startsWith(`${norm(s)}_`)) ?? null;
}
