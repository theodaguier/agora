import { PanelBar } from "@/components/PaneHeader";
import { useQuery } from "@tanstack/react-query";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { CommonConversations, Details } from "@/components/ProfileSheet";
import { WorkingOn } from "@/components/WorkingOn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { defineMessages, useT } from "@/i18n";
import type { UserProfile } from "@/lib/api";
import { openProfile } from "@/lib/profile";
import { userProfileQuery } from "@/lib/queries";

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
    <aside className="flex h-full w-full flex-col bg-background">
      <PanelBar closeLabel={t.hidePanel} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t.unavailable}
          </p>
        ) : person ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Identity person={person} />
              <Button variant="secondary" onClick={() => openProfile(userId)} className="self-start">
                {t.seeProfile}
              </Button>
            </div>
            <WorkingOn userId={userId} />
            <Details person={person} />
            <CommonConversations userId={userId} />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        )}
      </div>
    </aside>
  );
}

/** Photo, name, role and handle, aligned like the bot's panel (Figma « En-tête agent »). */
function Identity({ person }: { person: UserProfile }) {
  const subtitle = [person.title, person.username && `@${person.username}`].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col items-start gap-0.5">
      <PersonAvatar person={person} className="mb-3 size-16" />
      <h2 className="max-w-full truncate text-xl leading-[26px] font-medium">{person.name}</h2>
      {subtitle && <p className="max-w-full truncate text-[13px] leading-[18px] text-muted-foreground">{subtitle}</p>}
      {/* The status is already under the name in the conversation's header. */}
    </div>
  );
}
