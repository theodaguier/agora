/* Requests a bot makes in a conversation (a connector, a skill, bots), read by their cards. */
import { api } from "./api";
import type { BotRequest, McpRequest, SkillRequest } from "./types";

export const mcpRequestQuery = (id: string) => ({
  queryKey: ["mcp-request", id],
  queryFn: () => api<McpRequest>(`/mcp-requests/${id}`),
});

export const skillRequestQuery = (id: string) => ({
  queryKey: ["skill-request", id],
  queryFn: () => api<SkillRequest>(`/skill-requests/${id}`),
});

export const botRequestQuery = (id: string) => ({
  queryKey: ["bot-request", id],
  queryFn: () => api<BotRequest>(`/bot-requests/${id}`),
});
