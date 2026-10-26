import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { CloseIcon } from "@/components/icons";
import { useState, type ReactNode } from "react";
import { AgentScreen } from "@/components/AgentScreen";
import { AgentSheet } from "@/components/AgentSheet";
import { openAgentProfile } from "@/lib/profile";
import { RoutineActions, useToggleRoutine } from "@/components/RoutineDialog";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/Shortcuts";
import { shortcuts } from "@/lib/shortcuts";
import { mascot } from "@/lib/agent-avatar";
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
    next: (when: string) => `Prochaine : ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    paused: "En pause",
    failed: "Action impossible.",
  },
});

/**
 * Figma « Panneau agent »: the bot's clay portrait and name, its actions as grey pills, then its
 * screen and its routines, each a grey title above a hairline card.
 */
export function RightPanel({
  conversationId,
  agent,
  onMention,
  onClose,
}: {
  conversationId: string;
  agent: AgentSummary;
  /** Adds the routine to the message being written. */
  onMention: (routine: Routine) => void;
  onClose: () => void;
}) {
  const { data: routines = [] } = useQuery(routinesQuery(conversationId));
  const { user } = useRouteContext({ from: "/app" });
  const [editing, setEditing] = useState(false);
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
        <div className="flex flex-col gap-3">
          <img src={mascot(agent.avatar.color).figure} alt="" draggable={false} className="aspect-[7/5] w-full rounded-2xl bg-[#efe9e1] object-cover" />
          <h2 className="pt-1 text-xl leading-[26px] font-medium">{agent.name}</h2>
          <div className="flex flex-wrap gap-2">
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
        </div>

        {/* Nothing to show: one grey line, never an empty card. */}
        <PanelSection title={t.screen} card={false}>
          <AgentScreen conversationId={conversationId} agentName={agent.name} />
        </PanelSection>

        <PanelSection title={t.routines} card={routines.length > 0}>
          {routines.length === 0 ? (
            <p className="pl-0.5 text-[13px] text-subtle">{t.noRoutines}</p>
          ) : (
            <div className="flex flex-col py-1">
              {routines.map((r) => (
                <RoutineItem key={r.id} conversationId={conversationId} routine={r} onMention={() => onMention(r)} />
              ))}
            </div>
          )}
        </PanelSection>
      </div>
    </aside>
  );
}

/** A grey title above a hairline card (`card`), or above a plain line. */
function PanelSection({ title, card, children }: { title: string; card: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="pl-0.5 text-[13px] leading-[18px] text-muted-foreground">{title}</h3>
      {card ? <div className="overflow-hidden rounded-xl border border-border">{children}</div> : children}
    </section>
  );
}

/** Figma « Ligne de réglage »: the routine and when it runs; its actions on hover. */
function RoutineItem({ conversationId, routine, onMention }: { conversationId: string; routine: Routine; onMention: () => void }) {
  const t = useT(messages);
  const toggle = useToggleRoutine(conversationId, routine);
  return (
    <div className="group/routine flex items-center gap-3 px-3.5 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm leading-5">{routine.name}</p>
        <p className="truncate text-xs leading-4 text-muted-foreground">
          {routine.enabled ? (routine.nextRunAt ? t.next(dividerLabel(new Date(routine.nextRunAt))) : scheduleLabel(routine)) : t.paused}
        </p>
      </div>
      <RoutineActions conversationId={conversationId} routine={routine} toggle={toggle} onMention={onMention} />
    </div>
  );
}
