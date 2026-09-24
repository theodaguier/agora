import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, useToast } from "heroui-native";
import { useState } from "react";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { clearRestart, useRestartNeeded } from "@/lib/marketplace";

/* RestartProvider of apps/web/src/components/admin/ui.tsx: one flag for the whole app, shown where it matters. */

const t = defineMessages({
  en: {
    restartFailed: "Restart failed. Is Hermes running?",
    restartNeeded: "Restart Hermes so agents pick up the changed MCP servers, plugins and credentials.",
    restarting: "Restarting…",
    restart: "Restart",
    restarted: "Hermes restarted",
  },
  fr: {
    restartFailed: "Le redémarrage a échoué. Hermes tourne-t-il ?",
    restartNeeded: "Redémarre Hermes pour que les agents voient les MCP, plugins et credentials modifiés.",
    restarting: "Redémarrage…",
    restart: "Redémarrer",
    restarted: "Hermes redémarré",
  },
});

export function RestartBanner() {
  const needed = useRestartNeeded();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [restarting, setRestarting] = useState(false);
  if (!needed) return null;

  // The outcome is a HeroUI Toast; the banner stays until the restart went through.
  const restart = async () => {
    setRestarting(true);
    try {
      await api("/admin/hermes/restart", { method: "POST" });
      // The gateway finishes in-flight replies, exits, then is restarted.
      await new Promise((r) => setTimeout(r, 8000));
      clearRestart();
      qc.invalidateQueries({ queryKey: ["hermes"] });
      toast.show({ variant: "success", label: t.restarted });
    } catch {
      toast.show({ variant: "danger", label: t.restartFailed });
    }
    setRestarting(false);
  };

  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content className="gap-2">
        <Alert.Title>{t.restartNeeded}</Alert.Title>
        <Button size="sm" className="self-start" isDisabled={restarting} onPress={withTap(restart)}>
          {restarting ? t.restarting : t.restart}
        </Button>
      </Alert.Content>
    </Alert>
  );
}
