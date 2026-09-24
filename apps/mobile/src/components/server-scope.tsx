import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { ApiError, setActiveServer } from "@/lib/api";
import { sessionQuery } from "@/lib/queries";
import { useServers, type Server } from "@/lib/servers";
import type { SessionUser } from "@/lib/types";

/**
 * The signed-in screens of one instance: `api()` targets it and its data lives in its own
 * QueryClient, so switching organization never mixes two caches. A 401 means this phone was
 * signed out (from the web, or the session expired): the instance is forgotten.
 */
export function ServerScope({ server, children }: { server: Server; children: ReactNode }) {
  const { remove } = useServers();
  setActiveServer(server);
  const [client] = useState(
    () =>
      new QueryClient({
        // Any action that fails (save, send, delete…) is felt, not only read: the iOS error haptic.
        // A screen that can't load (after its retries) too — not a background refetch that failed
        // over data already shown, nor the 401 that signs out.
        queryCache: new QueryCache({
          onError: (err, query) => {
            if (query.state.data !== undefined || (err instanceof ApiError && err.status === 401)) return;
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          },
        }),
        mutationCache: new MutationCache({
          onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
        }),
        defaultOptions: {
          queries: {
            retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
          },
        },
      }),
  );
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        const err = event.query.state.error;
        if (err instanceof ApiError && err.status === 401) remove(server.url);
      }),
    [client, remove, server.url],
  );
  return (
    <ServerContext value={server}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ServerContext>
  );
}

const ServerContext = createContext<Server | null>(null);

/** The instance of the signed-in screens. */
export function useServer() {
  const server = use(ServerContext);
  if (!server) throw new Error("useServer outside ServerScope");
  return server;
}

/** The signed-in account (the web's `useRouteContext({ from: "/app" }).user`). */
export function useMe(): SessionUser {
  const server = useServer();
  const session = useQuery(sessionQuery).data;
  return session ?? { id: server.user.id, name: server.user.name, email: server.user.email, image: server.user.image ?? null, role: null };
}
