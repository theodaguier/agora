import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { ChevronsRightIcon, ClockIcon, SettingsIcon } from "@/components/icons";
import { useState } from "react";
import { AgentScreen } from "@/components/AgentScreen";
import { AgentSheet } from "@/components/AgentSheet";
import { openAgentProfile } from "@/lib/profile";
import { RoutineActions, useToggleRoutine } from "@/components/RoutineDialog";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/Shortcuts";
import { shortcuts } from "@/lib/shortcuts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { defineMessages, useT } from "@/i18n";
import { dividerLabel } from "@/lib/dates";
import { routinesQuery, type Routine } from "@/lib/queries";
import { scheduleLabel } from "@/lib/routines";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    editBot: "Edit bot",
    hidePanel: "Hide panel",
    routines: "Routines",
    noRoutines: "No routines.",
    next: (when: string) => `Next: ${when}`,
    paused: "Paused",
    failed: "Action failed.",
    seeProfile: "See profile and tasks",
  },
  fr: {
    editBot: "Modifier le bot",
    hidePanel: "Masquer le panneau",
    routines: "Routines",
    noRoutines: "Aucune routine.",
    next: (when: string) => `Prochaine : ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    paused: "En pause",
    failed: "Action impossible.",
    seeProfile: "Voir le profil et les tâches",
  },
});

export function RightPanel({
  conversationId,
  agentId,
  agentName,
  onMention,
  onClose,
}: {
  conversationId: string;
  agentId: string;
  agentName: string;
  /** Adds the routine to the message being written. */
  onMention: (routine: Routine) => void;
  onClose: () => void;
}) {
  const { data: routines = [] } = useQuery(routinesQuery(conversationId));
  const { user } = useRouteContext({ from: "/app" });
  const [editing, setEditing] = useState(false);
  const t = useT(messages);
  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col bg-sidebar">
      <div className="flex h-12 shrink-0 items-center justify-end gap-1 px-3">
        {user.role === "admin" && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon" aria-label={t.editBot} className="rounded-lg" onClick={() => setEditing(true)} />}
              >
                <SettingsIcon />
              </TooltipTrigger>
              <TooltipContent>{t.editBot}</TooltipContent>
            </Tooltip>
            <AgentSheet agentId={agentId} open={editing} onOpenChange={setEditing} />
          </>
        )}
        <ShortcutTooltip label={t.hidePanel} shortcut={shortcuts.togglePanel}>
          <Button variant="ghost" size="icon" aria-label={t.hidePanel} onClick={onClose} className="rounded-lg">
            <ChevronsRightIcon />
          </Button>
        </ShortcutTooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <AgentScreen conversationId={conversationId} agentName={agentName} />

        <h2 className="mb-2 mt-5 text-[13px] font-medium text-muted-foreground">{t.routines}</h2>
        {routines.length === 0 ? (
          <p className="text-sm text-subtle">{t.noRoutines}</p>
        ) : (
          <div className="-mx-2 flex flex-col">
            {routines.map((r) => (
              <RoutineItem key={r.id} conversationId={conversationId} routine={r} onMention={() => onMention(r)} />
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={() => openAgentProfile(agentId)} className="mt-5">
          {t.seeProfile}
        </Button>
      </div>
    </aside>
  );
}

function RoutineItem({ conversationId, routine, onMention }: { conversationId: string; routine: Routine; onMention: () => void }) {
  const t = useT(messages);
  const toggle = useToggleRoutine(conversationId, routine);
  return (
    <Item size="sm" className="items-start px-2 py-2 hover:bg-muted/50">
      <ItemMedia className="pt-0.5">
        <ClockIcon className={cn("size-4", routine.enabled ? "text-success" : "text-muted-foreground")} />
      </ItemMedia>
      <ItemContent className="gap-0.5">
        <ItemTitle className="font-normal">{routine.name}</ItemTitle>
        <ItemDescription className="text-[13px]">{scheduleLabel(routine)}</ItemDescription>
        {(!routine.enabled || routine.nextRunAt) && (
          <ItemDescription className="text-[13px]">
            {routine.enabled ? t.next(dividerLabel(new Date(routine.nextRunAt!))) : t.paused}
          </ItemDescription>
        )}
        {toggle.error && <p className="text-[13px] text-destructive">{toggle.error.message || t.failed}</p>}
      </ItemContent>
      <ItemActions>
        <RoutineActions conversationId={conversationId} routine={routine} toggle={toggle} onMention={onMention} />
      </ItemActions>
    </Item>
  );
}
