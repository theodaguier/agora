import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Attachment, Message } from "./types";

/* apps/web/src/lib/conversation-files.tsx */

const FilesContext = createContext<ReadonlyMap<string, Attachment>>(new Map());

/**
 * The files sent in a conversation, by name: a message naming one ("rapport.pdf")
 * links to it. With two files of the same name, the latest wins.
 */
export function ConversationFilesProvider({ messages, children }: { messages: Message[]; children: ReactNode }) {
  const files = useMemo(() => new Map(messages.flatMap((m) => m.data?.attachments ?? []).map((a) => [a.name.toLowerCase(), a])), [messages]);
  return <FilesContext.Provider value={files}>{children}</FilesContext.Provider>;
}

/** The file of the conversation with this name, if any. */
export const useConversationFile = (name: string) => useContext(FilesContext).get(name.toLowerCase());
