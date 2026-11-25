import { defineMessages, useT } from "@/i18n";
import { useOrgTitle } from "@/lib/org";
import { SimpleHome } from "@/components/SimpleShell";
import { useSimple } from "@/lib/simple";

const messages = defineMessages({
  en: { pickAgent: "Pick an agent to get started." },
  fr: { pickAgent: "Choisis un agent pour commencer." },
});

/** The app's home: nothing open yet; the simple interface opens a new chat (components/SimpleShell). */
export function Welcome() {
  return useSimple() ? <SimpleHome /> : <PickAgent />;
}

function PickAgent() {
  const t = useT(messages);
  useOrgTitle();
  return (
    <div className="grid h-full flex-1 place-items-center bg-background">
      <p className="text-sm text-muted-foreground">{t.pickAgent}</p>
    </div>
  );
}
