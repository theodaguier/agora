import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useId } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { common } from "@agora/core/i18n";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    require: "Require two-step verification",
    requireHelp: "Every account must turn it on before using Agora, on the web and in the mobile app.",
    ownFirst: "Turn it on for your own account first.",
    confirmTitle: "Require two-step verification?",
    confirmText: "Accounts that haven't turned it on will be asked to, and can't use Agora until they do.",
    confirm: "Require",
    allTools: "Every tool for new bots",
    allToolsHelp: "Each new bot starts with browser, terminal and file writes, with nothing to turn on bot by bot. Existing bots keep their tools.",
    allToolsTitle: "Give new bots every tool?",
    allToolsText: "With the terminal and the browser, a bot acts on the server that hosts Agora. An instruction hidden in a page or a file it reads can push it to.",
    allToolsConfirm: "Turn on",
  },
  fr: {
    require: "Exiger la validation en deux étapes",
    requireHelp: "Chaque compte doit l'activer avant d'utiliser Agora, sur le web comme dans l'app mobile.",
    ownFirst: "Active-la d'abord sur ton propre compte.",
    confirmTitle: "Exiger la validation en deux étapes ?",
    confirmText: "Les comptes qui ne l'ont pas activée devront le faire, et ne pourront plus utiliser Agora d'ici là.",
    confirm: "Exiger",
    allTools: "Tous les outils pour les nouveaux bots",
    allToolsHelp: "Chaque nouveau bot naît avec le navigateur, le terminal et l'écriture de fichiers, sans rien activer bot par bot. Les bots existants gardent leurs outils.",
    allToolsTitle: "Donner tous les outils aux nouveaux bots ?",
    allToolsText: "Avec le terminal et le navigateur, un bot agit sur le serveur qui héberge Agora. Une instruction cachée dans une page ou un fichier qu'il lit peut l'y pousser.",
    allToolsConfirm: "Activer",
  },
});

/** Settings › Security (admin): two-step verification required for every account (middleware.ts of the API). */
export function RequireTwoFactor() {
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const qc = useQueryClient();
  const { user } = useRouteContext({ from: "/app" });
  const ownEnabled = !!(user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled;
  const { data } = useQuery({ queryKey: ["admin", "org"], queryFn: () => api<{ requireTwoFactor: boolean }>("/admin/org") });
  const save = useMutation({
    mutationFn: (requireTwoFactor: boolean) => api("/admin/org", { method: "PUT", body: JSON.stringify({ requireTwoFactor }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "org"] });
      qc.invalidateQueries({ queryKey: ["org"] });
    },
    meta: { success: c.saved },
  });
  if (!data) return null;

  return (
    <Field orientation="horizontal" data-disabled={(!ownEnabled && !data.requireTwoFactor) || undefined}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{t.require}</FieldLabel>
        <FieldDescription>{ownEnabled ? t.requireHelp : t.ownFirst}</FieldDescription>
      </FieldContent>
      <Switch
        id={id}
        checked={save.isPending ? save.variables : data.requireTwoFactor}
        disabled={save.isPending || (!ownEnabled && !data.requireTwoFactor)}
        onCheckedChange={async (on) => {
          if (on && !(await confirmAction({ title: t.confirmTitle, description: t.confirmText, action: t.confirm, destructive: false }))) return;
          save.mutate(on);
        }}
      />
    </Field>
  );
}

/** Settings › Security (admin): new bots are born with every tool instead of confined (sandbox.ts of the API). */
export function NewBotsAllTools() {
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "org"], queryFn: () => api<{ newBotsAllTools: boolean }>("/admin/org") });
  const save = useMutation({
    mutationFn: (newBotsAllTools: boolean) => api("/admin/org", { method: "PUT", body: JSON.stringify({ newBotsAllTools }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "org"] }),
    meta: { success: c.saved },
  });
  if (!data) return null;

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{t.allTools}</FieldLabel>
        <FieldDescription>{t.allToolsHelp}</FieldDescription>
      </FieldContent>
      <Switch
        id={id}
        checked={save.isPending ? save.variables : data.newBotsAllTools}
        disabled={save.isPending}
        onCheckedChange={async (on) => {
          if (on && !(await confirmAction({ title: t.allToolsTitle, description: t.allToolsText, action: t.allToolsConfirm, destructive: false }))) return;
          save.mutate(on);
        }}
      />
    </Field>
  );
}
