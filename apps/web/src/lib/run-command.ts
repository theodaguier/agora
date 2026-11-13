import { createContext } from "react";

/**
 * Where a shell block's « Exécuter » goes: in a conversation, a message asking its bot to run the
 * command with its own terminal (its approvals apply) and to read what comes back, as Claude Desktop
 * does. Elsewhere (null) the block has no such button.
 */
export const RunCommandContext = createContext<((command: string, language: string) => void) | null>(null);
