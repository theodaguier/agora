import { defineMessages, useT } from "@/i18n";
import { useOrgTitle } from "@/lib/org";

const messages = defineMessages({
  en: { pickAgent: "Pick an agent to get started." },
  fr: { pickAgent: "Choisis un agent pour commencer." },
});

export function Welcome() {
  const t = useT(messages);
  useOrgTitle();
  return (
    <div className="grid h-full flex-1 place-items-center bg-background">
      <p className="text-sm text-muted-foreground">{t.pickAgent}</p>
    </div>
  );
}
