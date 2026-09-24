import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RedoIcon, CloseIcon } from "@/components/icons";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Alert, AlertAction, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    restartFailed: "Restart failed. Is Hermes running?",
    restartNeeded: "Restart Hermes so agents pick up the changed MCP servers, plugins and credentials.",
    restarting: "Restarting…",
    restart: "Restart",
  },
  fr: {
    restartFailed: "Le redémarrage a échoué. Hermes tourne-t-il ?",
    restartNeeded: "Redémarre Hermes pour que les agents voient les MCP, plugins et credentials modifiés.",
    restarting: "Redémarrage…",
    restart: "Redémarrer",
  },
});

export function SectionHeader(props: { title: string; text: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{props.text}</p>
      </div>
      {props.action && (
        <Button onClick={props.onAction}>
          {props.action}
        </Button>
      )}
    </div>
  );
}

/** Creation form collapsed under a section header. */
export function FormCard({ children, onClose, title }: { children: ReactNode; onClose?: () => void; title: string }) {
  const c = useT(common);
  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {onClose && (
          <CardAction>
            <Button variant="ghost" size="icon-sm" aria-label={c.close} onClick={onClose}>
              <CloseIcon />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const c = useT(common);
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : c.unknownError}
    </p>
  );
}

export function Loading({ label }: { label?: string }) {
  const c = useT(common);
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Spinner /> {label ?? c.loading}
    </p>
  );
}

/* ---------- Gateway restart (MCP and plugins) ---------- */

const RestartContext = createContext<{ needed: boolean; flag: () => void }>({ needed: false, flag: () => {} });

export function RestartProvider({ children }: { children: ReactNode }) {
  const [needed, setNeeded] = useState(false);
  const [state, setState] = useState<"idle" | "restarting" | "error">("idle");
  const qc = useQueryClient();
  const t = useT(messages);

  const restart = async () => {
    setState("restarting");
    try {
      await api("/admin/hermes/restart", { method: "POST" });
      // The gateway finishes in-flight replies, exits, then is restarted.
      await new Promise((r) => setTimeout(r, 8000));
      setNeeded(false);
      setState("idle");
      qc.invalidateQueries({ queryKey: ["hermes"] });
    } catch {
      setState("error");
    }
  };

  const context = useMemo(() => ({ needed, flag: () => setNeeded(true) }), [needed]);
  return (
    <RestartContext.Provider value={context}>
      {needed && (
        <Alert className="mb-5">
          <RedoIcon />
          <AlertTitle>{state === "error" ? t.restartFailed : t.restartNeeded}</AlertTitle>
          <AlertAction>
            <Button onClick={restart} disabled={state === "restarting"}>
              {state === "restarting" ? t.restarting : t.restart}
            </Button>
          </AlertAction>
        </Alert>
      )}
      {children}
    </RestartContext.Provider>
  );
}

export const useRestartNeeded = () => useContext(RestartContext).flag;

/* ---------- Hermes dashboard background tasks (skill installs…) ---------- */

type ActionStatus = { name: string; running: boolean; exit_code: number | null; lines?: string[] };

export function useAction(name: string | null, onDone: (ok: boolean) => void) {
  return useQuery({
    queryKey: ["hermes", "action", name],
    enabled: !!name,
    queryFn: async () => {
      const status = await api<ActionStatus>(`/admin/hermes/actions/${encodeURIComponent(name!)}`);
      if (!status.running) onDone(status.exit_code === 0);
      return status;
    },
    refetchInterval: (q) => (q.state.data && !q.state.data.running ? false : 1500),
  });
}
