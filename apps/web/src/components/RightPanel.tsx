import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { CloseIcon } from "@/components/icons";
import { useState, type ReactNode } from "react";
import { AgentScreen } from "@/components/AgentScreen";
import { FilesPanel } from "@/components/ConversationPanels";
import { useTurns } from "@/lib/realtime";
import { AgentSheet } from "@/components/AgentSheet";
import { openAgentProfile } from "@/lib/profile";
import { RoutineActions, useToggleRoutine } from "@/components/RoutineDialog";
import { Button } from "@/components/ui/button";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Skeleton } from "@/components/ui/skeleton";
import { CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { ShortcutTooltip } from "@/components/Shortcuts";
import { shortcuts } from "@/lib/shortcuts";
import { AgentOrb } from "@/components/AgentOrb";
import type { AgentSummary } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { dividerLabel } from "@/lib/dates";
import { routinesQuery, type Routine } from "@/lib/queries";
import { scheduleLabel } from "@/lib/routines";

const messages = defineMessages({
  en: {
    edit: "Edit",
    profile: "Profile and tasks",
    screen: "Screen",
    hidePanel: "Hide panel",
    routines: "Routines",
    noRoutines: "No routines.",
    routinesUnavailable: "Routines are unreachable for now.",
    next: (when: string) => `Next: ${when}`,
    paused: "Paused",
    failed: "Action failed.",
  },
  fr: {
    edit: "Modifier",
    profile: "Profil et tâches",
    screen: "Écran",
    hidePanel: "Masquer le panneau",
    routines: "Routines",
    noRoutines: "Aucune routine.",
    routinesUnavailable: "Routines injoignables pour le moment.",
    next: (when: string) => `Prochaine : ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    paused: "En pause",
    failed: "Action impossible.",
  },
});

/**
 * Bot panel: the bot's portrait and name, its actions, then its screen and its routines.
 */
export function RightPanel({
  conversationId,
  agent,
  onMention,
  onJump,
  initialTab = "details",
  onClose,
}: {
  conversationId: string;
  agent: AgentSummary;
  /** Adds the routine to the message being written. */
  onMention: (routine: Routine) => void;
  /** Shows a file's message in the conversation. */
  onJump: (messageId: string) => void;
  /** The tab it opens on: the header's screen and files buttons lead to theirs. */
  initialTab?: PanelTab;
  onClose: () => void;
}) {
  const routinesQ = useQuery(routinesQuery(conversationId));
  const routines = routinesQ.data ?? noRoutines;
  const { user } = useRouteContext({ from: "/app" });
  const [editing, setEditing] = useState(false);
  // A turn running: the bot is at work, so its computer is waking up.
  const turns = useTurns(conversationId);
  const t = useT(messages);
  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center justify-end gap-1 px-3">
        <ShortcutTooltip label={t.hidePanel} shortcut={shortcuts.togglePanel}>
          <Button variant="ghost" size="icon-sm" aria-label={t.hidePanel} onClick={onClose}>
            <CloseIcon />
          </Button>
        </ShortcutTooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
        {/* Who it is, centred, on its details only: its files and its computer need no introduction. */}
        {initialTab === "details" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <AgentOrb color={agent.avatar.color} className="size-24" />
            <h2 className="text-lg font-medium">{agent.name}</h2>
          </div>
        )}

        {/* What the header button asked for: its details, its files or its computer. */}
        {initialTab === "library" ? (
          <FilesPanel conversationId={conversationId} onJump={onJump} />
        ) : initialTab === "computer" ? (
          <AgentScreen conversationId={conversationId} agentName={agent.name} mascotColor={agent.avatar.color} waking={turns.length > 0} />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap justify-center gap-2">
              {user.role === "admin" && (
                <>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    {t.edit}
                  </Button>
                  <AgentSheet agentId={agent.id} open={editing} onOpenChange={setEditing} />
                </>
              )}
              <Button variant="secondary" onClick={() => openAgentProfile(agent.id)}>
                {t.profile}
              </Button>
            </div>
            <PanelSection title={t.routines} card={routines.length > 0}>
              {routinesQ.isPending ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ) : routinesQ.isError ? (
                <p className="text-sm text-muted-foreground" title={routinesQ.error.message}>
                  {t.routinesUnavailable}
                </p>
              ) : routines.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noRoutines}</p>
              ) : (
                <ListCardRows>
                  {routines.map((r) => (
                    <RoutineItem key={r.id} conversationId={conversationId} routine={r} onMention={() => onMention(r)} />
                  ))}
                </ListCardRows>
              )}
            </PanelSection>
                    </div>
        )}
      </div>
    </aside>
  );
}

export type PanelTab = "details" | "library" | "computer";

const noRoutines: Routine[] = [];

/** A list card with its title (`card`, children are its ListCardRows), or a title above a plain line. */
function PanelSection({ title, card, children }: { title: string; card: boolean; children: ReactNode }) {
  if (card)
    return (
      <ListCard size="sm">
        <ListCardHeader>
          <CardTitle>{title}</CardTitle>
        </ListCardHeader>
        {children}
      </ListCard>
    );
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** The routine and when it runs, then its actions. */
function RoutineItem({ conversationId, routine, onMention }: { conversationId: string; routine: Routine; onMention: () => void }) {
  const t = useT(messages);
  const toggle = useToggleRoutine(conversationId, routine);
  return (
    <Item size="sm" role="listitem" className="flex-nowrap">
      <ItemContent className="min-w-0">
        <ItemTitle>{routine.name}</ItemTitle>
        <ItemDescription className="line-clamp-1">
          {routine.enabled ? (routine.nextRunAt ? t.next(dividerLabel(new Date(routine.nextRunAt))) : scheduleLabel(routine)) : t.paused}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <RoutineActions conversationId={conversationId} routine={routine} toggle={toggle} onMention={onMention} />
      </ItemActions>
    </Item>
  );
}
