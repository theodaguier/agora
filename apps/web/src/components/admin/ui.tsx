import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RedoIcon, WarningIcon } from "@/components/icons";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ItemMedia } from "@/components/ui/item";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    restartFailed: "Restart failed. Is Hermes running?",
    restartNeeded: "Hermes needs a restart",
    restartWhy: "Bots only see the changed connectors, plugins and secrets after it.",
    restarting: "Restarting…",
    restart: "Restart",
    unreachable: "Unavailable for now. Try again in a moment.",
    unreachableTitle: "Can't load this for now",
    unreachableText: "The server isn't answering. Try again in a moment.",
  },
  fr: {
    restartFailed: "Le redémarrage a échoué. Hermes tourne-t-il ?",
    restartNeeded: "Hermes doit redémarrer",
    restartWhy: "Les bots ne voient les connecteurs, plugins et secrets modifiés qu'après.",
    restarting: "Redémarrage…",
    restart: "Redémarrer",
    unreachable: "Indisponible pour le moment. Réessaie dans un instant.",
    unreachableTitle: "Chargement impossible pour le moment",
    unreachableText: "Le serveur ne répond pas. Réessaie dans un instant.",
  },
});

/**
 * Figma « Ligne de liste »: the icon of a settings row in a muted tile, as its ItemMedia. Rows whose
 * media says more (an avatar, a logo) keep it.
 */
export function SettingTile({ children }: { children: ReactNode }) {
  return (
    <ItemMedia>
      <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-4">{children}</span>
    </ItemMedia>
  );
}

/** Figma « Réglages », as Linear's: a section's name, then its rows in one bordered group, split by hairlines. */
export function SettingsGroup({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      {title && <h3 className="text-ui font-medium">{title}</h3>}
      <div className="flex flex-col divide-y rounded-lg border">{children}</div>
      {footer}
    </section>
  );
}

/** One row of a SettingsGroup: what it is on the left (a hint under it), its value or control on the right. */
export function SettingsRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 px-4 py-2.5 text-ui">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Title of a settings tab, with its intro and main action: the same header on every tab. */
export function SectionHeader(props: { title: string; text?: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-medium">{props.title}</h2>
        {props.text && <p className="text-ui text-muted-foreground">{props.text}</p>}
      </div>
      {props.action && (
        <Button size="sm" onClick={props.onAction}>
          {props.action}
        </Button>
      )}
    </div>
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
  // Nothing for a quick answer; past a moment, the rows' shape in place of a spinner (Linear, Raycast).
  const [late, setLate] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLate(true), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <div role="status" aria-label={label ?? c.loading} className="flex flex-col">
      {late &&
        [0, 1, 2].map((i) => (
          <div key={i} className="flex h-10 items-center justify-between gap-6">
            <Skeleton className={cn("h-3", ["w-40", "w-32", "w-48"][i])} />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
    </div>
  );
}

/** A section whose data couldn't be fetched (often Hermes down): one muted line, the technical cause in a tooltip. */
export function LoadError({ error, text }: { error?: unknown; text?: string }) {
  const t = useT(messages);
  return (
    <p className="text-sm text-muted-foreground" title={error instanceof Error ? error.message : undefined}>
      {text ?? t.unreachable}
    </p>
  );
}

/** A whole settings tab whose data couldn't be fetched: what happened and a way to try again. */
export function LoadFailed({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WarningIcon />
        </EmptyMedia>
        <EmptyTitle>{t.unreachableTitle}</EmptyTitle>
        <EmptyDescription title={error instanceof Error ? error.message : undefined}>{t.unreachableText}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          {c.retry}
        </Button>
      </EmptyContent>
    </Empty>
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
          {state !== "error" && <AlertDescription>{t.restartWhy}</AlertDescription>}
          <AlertAction>
            <Button size="sm" onClick={restart} disabled={state === "restarting"}>
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
