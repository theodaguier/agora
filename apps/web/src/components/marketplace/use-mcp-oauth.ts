import { useState } from "react";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/i18n";

const messages = defineMessages({
  en: {
    noAuthUrl: "The service didn't provide an authorization URL.",
    authorizeInTab: "Allow access in the tab that just opened…",
    authDenied: "Authorization denied.",
    authExpired: "The authorization expired.",
    tabClosed: "The authorization window was closed before the end.",
  },
  fr: {
    noAuthUrl: "Le service n'a pas fourni d'adresse d'autorisation.",
    authorizeInTab: "Autorise l'accès dans l'onglet ouvert…",
    authDenied: "Autorisation refusée.",
    authExpired: "L'autorisation a expiré.",
    tabClosed: "La fenêtre d'autorisation a été fermée avant la fin.",
  },
});

/**
 * OAuth sign-in of an app-declared MCP connector (`/mcp-requests/:id`): opens the
 * provider in a new tab and waits for Hermes to receive the tokens.
 * `before` runs once the tab is open (the declaration in Hermes, for instance).
 */
export function useMcpOAuth() {
  const [status, setStatus] = useState<string | null>(null);
  const authorize = async (id: string, before?: () => Promise<unknown>) => {
    // Open the window right away: otherwise the browser blocks it after the wait.
    const tab = window.open("about:blank", "_blank");
    try {
      await before?.();
      const flow = await api<{ flow_id: string; authorization_url: string | null; error: string | null }>(`/mcp-requests/${id}/oauth`, { method: "POST" });
      if (!flow.authorization_url) throw new Error(flow.error ?? tr(messages).noAuthUrl);
      if (tab) tab.location.href = flow.authorization_url;
      else window.location.assign(flow.authorization_url);
      setStatus(tr(messages).authorizeInTab);
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2_000));
        const s = await api<{ status: string; error: string | null }>(`/mcp-requests/${id}/oauth/${flow.flow_id}`);
        if (s.status === "approved") return;
        if (s.status === "error") throw new Error(s.error ?? tr(messages).authDenied);
        // Closed without authorizing: stop waiting (one last check, the callback may have just landed).
        if (tab?.closed) {
          await new Promise((r) => setTimeout(r, 2_000));
          const last = await api<{ status: string }>(`/mcp-requests/${id}/oauth/${flow.flow_id}`);
          if (last.status === "approved") return;
          await api(`/mcp-requests/${id}/oauth`, { method: "DELETE" }).catch(() => {});
          throw new Error(tr(messages).tabClosed);
        }
      }
      throw new Error(tr(messages).authExpired);
    } catch (err) {
      tab?.close();
      throw err;
    } finally {
      setStatus(null);
    }
  };
  return { authorize, status };
}
