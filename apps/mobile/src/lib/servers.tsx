import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { tokenKey, tokens } from "@/lib/server-tokens";

/**
 * An Agora instance the app is signed in to. Each organization hosts its own:
 * the app keeps one entry per server, with its own session token.
 */
export type Server = {
  /** Origin of the instance, without trailing slash ("https://agora.acme.com"). */
  url: string;
  orgName: string;
  /** Logo path on the instance ("/api/org/avatar?v=…"), or null for the default mark. */
  orgImage: string | null;
  user: { id: string; name: string; email: string; image?: string | null };
};

const SERVERS_KEY = "agora.servers";
const CURRENT_KEY = "agora.current";

type ServersState = {
  ready: boolean;
  servers: Server[];
  current: Server | null;
  /** Adds (or re-pairs) a server with its token, and makes it the current one. */
  save: (server: Server, token: string) => Promise<void>;
  select: (url: string) => Promise<void>;
  /** Forgets the server and its token (the session itself is closed by the caller). */
  remove: (url: string) => Promise<void>;
};

const ServersContext = createContext<ServersState | null>(null);

export function ServersProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [saved, current] = await Promise.all([SecureStore.getItemAsync(SERVERS_KEY), SecureStore.getItemAsync(CURRENT_KEY)]);
      const list: Server[] = JSON.parse(saved ?? "[]");
      // The keychain reads are independent: all at once, so launch doesn't wait for each server in turn.
      const found = await Promise.all(list.map((s) => SecureStore.getItemAsync(tokenKey(s.url))));
      list.forEach((s, i) => {
        const token = found[i];
        if (token) tokens.set(s.url, token);
      });
      // A server without its token (keychain restored elsewhere) has to be paired again.
      const usable = list.filter((s) => tokens.has(s.url));
      setServers(usable);
      setCurrentUrl(usable.some((s) => s.url === current) ? current : (usable[0]?.url ?? null));
      setReady(true);
    })().catch((err) => {
      console.error("servers: load", err);
      setReady(true);
    });
  }, []);

  const persist = useCallback(async (list: Server[], current: string | null) => {
    setServers(list);
    setCurrentUrl(current);
    await SecureStore.setItemAsync(SERVERS_KEY, JSON.stringify(list));
    if (current) await SecureStore.setItemAsync(CURRENT_KEY, current);
    else await SecureStore.deleteItemAsync(CURRENT_KEY);
  }, []);

  const save = useCallback(
    async (server: Server, token: string) => {
      tokens.set(server.url, token);
      await SecureStore.setItemAsync(tokenKey(server.url), token);
      await persist([...servers.filter((s) => s.url !== server.url), server], server.url);
    },
    [servers, persist],
  );

  const select = useCallback((url: string) => persist(servers, url), [servers, persist]);

  const remove = useCallback(
    async (url: string) => {
      tokens.delete(url);
      await SecureStore.deleteItemAsync(tokenKey(url));
      const rest = servers.filter((s) => s.url !== url);
      await persist(rest, currentUrl === url ? (rest[0]?.url ?? null) : currentUrl);
    },
    [servers, currentUrl, persist],
  );

  const value = useMemo<ServersState>(
    () => ({ ready, servers, current: servers.find((s) => s.url === currentUrl) ?? null, save, select, remove }),
    [ready, servers, currentUrl, save, select, remove],
  );
  return <ServersContext value={value}>{children}</ServersContext>;
}

export function useServers() {
  const value = use(ServersContext);
  if (!value) throw new Error("useServers outside ServersProvider");
  return value;
}
