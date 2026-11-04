import { useQuery } from "@tanstack/react-query";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AgentEditor } from "@/components/admin/AgentDetail";
import { Loading, RestartProvider } from "@/components/admin/ui";
import { BotIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { adminAgentsQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    editAgent: (name: string) => `Edit ${name}`,
    editBot: "Edit bot",
    hermesProfile: (profile: string) => `Hermes profile: ${profile}`,
    botSettings: "Bot settings",
    unavailable: "Settings unavailable",
    unavailableText: "The bot's settings can't be reached for now. Try again in a moment.",
    gone: "This bot no longer exists.",
  },
  fr: {
    editAgent: (name: string) => `Modifier ${name}`,
    editBot: "Modifier le bot",
    hermesProfile: (profile: string) => `profil Hermes : ${profile}`,
    botSettings: "Réglages du bot",
    unavailable: "Réglages indisponibles",
    unavailableText: "Les réglages du bot sont injoignables pour le moment. Réessaie dans un instant.",
    gone: "Ce bot n'existe plus.",
  },
});

/** Side panel for editing a bot, opened from the thread (admins only). */
export function AgentSheet({ agentId, open, onOpenChange }: { agentId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: agents, error, refetch } = useQuery({ ...adminAgentsQuery, enabled: open });
  const agent = agents?.find((a) => a.id === agentId);
  const t = useT(messages);
  const c = useT(common);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="flex-row items-center gap-3">
          {agent && <AgentAvatar agent={{ avatar: { shape: agent.avatarShape, color: agent.avatarColor } }} className="size-10" />}
          <div className="min-w-0">
            <SheetTitle className="truncate">{agent ? t.editAgent(agent.name) : t.editBot}</SheetTitle>
            <SheetDescription className="truncate">
              {agent ? t.hermesProfile(agent.hermesProfile) : t.botSettings}
            </SheetDescription>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 pb-4">
            <RestartProvider>
              {agent ? (
                <AgentEditor key={agent.id} agent={agent} initialTab="Profil" />
              ) : error ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <BotIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t.unavailable}</EmptyTitle>
                    <EmptyDescription title={error.message}>{t.unavailableText}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="secondary" onClick={() => void refetch()}>
                      {c.retry}
                    </Button>
                  </EmptyContent>
                </Empty>
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
