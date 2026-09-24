import { useQuery } from "@tanstack/react-query";
import { ChevronsRightIcon } from "@/components/icons";
import { PersonAvatar, useStatusLabel } from "@/components/ConversationAvatar";
import { CommonConversations, Details } from "@/components/ProfileSheet";
import { ShortcutTooltip } from "@/components/Shortcuts";
import { WorkingOn } from "@/components/WorkingOn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { defineMessages, useT } from "@/i18n";
import type { UserProfile } from "@/lib/api";
import { openProfile } from "@/lib/profile";
import { userProfileQuery } from "@/lib/queries";
import { shortcuts } from "@/lib/shortcuts";

const messages = defineMessages({
  en: {
    profile: "Profile",
    hidePanel: "Hide panel",
    unavailable: "Profile unavailable.",
    seeProfile: "See profile and tasks",
  },
  fr: {
    profile: "Profil",
    hidePanel: "Masquer le panneau",
    unavailable: "Profil indisponible.",
    seeProfile: "Voir le profil et les tâches",
  },
});

/** Side panel of a direct conversation with a colleague: who they are. */
export function PersonPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useT(messages);
  const { data: person, error } = useQuery(userProfileQuery(userId));
  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col bg-sidebar">
      <div className="flex h-12 shrink-0 items-center justify-between gap-1 px-3">
        <span className="text-[13px] font-medium text-muted-foreground">{t.profile}</span>
        <ShortcutTooltip label={t.hidePanel} shortcut={shortcuts.togglePanel}>
          <Button variant="ghost" size="icon" aria-label={t.hidePanel} onClick={onClose} className="rounded-lg">
            <ChevronsRightIcon />
          </Button>
        </ShortcutTooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t.unavailable}
          </p>
        ) : person ? (
          <div className="flex flex-col gap-5">
            <Identity person={person} />
            <WorkingOn userId={userId} />
            <Details person={person} />
            <CommonConversations userId={userId} />
            <Button variant="outline" size="sm" onClick={() => openProfile(userId)} className="self-start">
              {t.seeProfile}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 pt-2">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        )}
      </div>
    </aside>
  );
}

/** Photo, name, role, handle and presence. */
function Identity({ person }: { person: UserProfile }) {
  const status = useStatusLabel({ kind: "user", person });
  const subtitle = [person.title, person.username && `@${person.username}`].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col items-center gap-1 pt-2 text-center">
      <PersonAvatar person={person} className="mb-2 size-20" />
      <h2 className="max-w-full truncate text-base font-semibold">{person.name}</h2>
      {subtitle && <p className="max-w-full truncate text-sm text-muted-foreground">{subtitle}</p>}
      {status && <p className="text-[13px] text-subtle">{status}</p>}
    </div>
  );
}
