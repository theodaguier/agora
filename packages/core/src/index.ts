export type Role = "admin" | "member";

export interface Bot {
  id: string;
  name: string;
  /** Name of the Hermes profile that powers this bot. */
  hermesProfile: string;
}

export interface Conversation {
  id: string;
  title: string;
  botId: string;
  pinned: boolean;
  updatedAt: string;
}

export * from "./soul";
export * from "./events";
export * from "./handles";
export * from "./availability";
export * from "./integrations";
export * from "./mcp-env";
export * from "./messages";
