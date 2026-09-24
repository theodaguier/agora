/* Requests a bot makes in a conversation (a connector, a skill), read by their cards. */
import { api } from "./api";
import type { McpRequest, SkillRequest } from "./types";

export const mcpRequestQuery = (id: string) => ({
  queryKey: ["mcp-request", id],
  queryFn: () => api<McpRequest>(`/mcp-requests/${id}`),
});

export const skillRequestQuery = (id: string) => ({
  queryKey: ["skill-request", id],
  queryFn: () => api<SkillRequest>(`/skill-requests/${id}`),
});
