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
  },
  fr: {
    require: "Exiger la validation en deux étapes",
    requireHelp: "Chaque compte doit l'activer avant d'utiliser Agora, sur le web comme dans l'app mobile.",
    ownFirst: "Active-la d'abord sur ton propre compte.",
    confirmTitle: "Exiger la validation en deux étapes ?",
    confirmText: "Les comptes qui ne l'ont pas activée devront le faire, et ne pourront plus utiliser Agora d'ici là.",
    confirm: "Exiger",
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
