import { useQuery } from "@tanstack/react-query";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AgentEditor } from "@/components/admin/AgentDetail";
import { Loading, RestartProvider } from "@/components/admin/ui";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { adminAgentsQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    editAgent: (name: string) => `Edit ${name}`,
    editBot: "Edit bot",
    hermesProfile: (profile: string) => `Hermes profile: ${profile}`,
    botSettings: "Bot settings",
    unavailable: "Settings unavailable.",
    gone: "This bot no longer exists.",
  },
  fr: {
    editAgent: (name: string) => `Modifier ${name}`,
    editBot: "Modifier le bot",
    hermesProfile: (profile: string) => `profil Hermes : ${profile}`,
    botSettings: "Réglages du bot",
    unavailable: "Réglages indisponibles.",
    gone: "Ce bot n'existe plus.",
  },
});

/** Side panel for editing a bot, opened from the thread (admins only). */
export function AgentSheet({ agentId, open, onOpenChange }: { agentId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: agents, error } = useQuery({ ...adminAgentsQuery, enabled: open });
  const agent = agents?.find((a) => a.id === agentId);
  const t = useT(messages);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 bg-background data-[side=right]:sm:max-w-xl">
        <SheetHeader className="flex-row items-center gap-3 border-b border-border/60 px-5 py-4 pr-14">
          {agent && <AgentAvatar agent={{ avatar: { shape: agent.avatarShape, color: agent.avatarColor } }} className="size-10" />}
          <div className="min-w-0">
            <SheetTitle className="truncate">{agent ? t.editAgent(agent.name) : t.editBot}</SheetTitle>
            <SheetDescription className="truncate font-mono text-xs text-subtle">
              {agent ? t.hermesProfile(agent.hermesProfile) : t.botSettings}
            </SheetDescription>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 pb-10 pt-5">
            <RestartProvider>
              {agent ? (
                <AgentEditor key={agent.id} agent={agent} initialTab="Profil" />
              ) : error ? (
                <p role="alert" className="text-sm text-destructive">
                  {t.unavailable}
                </p>
              ) : agents ? (
                <p className="text-sm text-muted-foreground">{t.gone}</p>
              ) : (
                <Loading />
              )}
            </RestartProvider>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
