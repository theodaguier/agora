import { WikiMemory } from "@/components/admin/WikiMemory";
import { useOrgTitle } from "@/lib/org";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { title: "Second brain" },
  fr: { title: "Second cerveau" },
});

/** `/memory`: the second brain alone in its browser tab, the graph filling the page under its search and filters. */
export function MemoryWindow() {
  useOrgTitle(useT(messages).title);
  return (
    <main className="flex h-dvh flex-col bg-background p-4">
      <WikiMemory inTab />
    </main>
  );
}
