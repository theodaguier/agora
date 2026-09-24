/** MCP server of a tool reported by an agent ("mcp_pennylane_list_invoices" → "pennylane"), among the known ones. */
export function toolServer(tool: string, servers: string[]): string | null {
  const m = /^mcp_{1,2}(.+)$/i.exec(tool.trim());
  if (!m) return null;
  const rest = m[1]!.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "_");
  // Longest first: "google_calendar" before "google".
  return [...servers].sort((a, b) => b.length - a.length).find((s) => rest.startsWith(`${norm(s)}_`)) ?? null;
}
