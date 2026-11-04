import { PanelBar } from "@/components/PaneHeader";
import { useQuery } from "@tanstack/react-query";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { CommonConversations, Details } from "@/components/ProfileSheet";
import { WorkingOn } from "@/components/WorkingOn";
import { UserIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import type { UserProfile } from "@/lib/api";
import { openProfile } from "@/lib/profile";
import { userProfileQuery } from "@/lib/queries";

const messages = defineMessages({
  en: {
    profile: "Profile",
    hidePanel: "Hide panel",
    unavailable: "Profile unavailable",
    unavailableText: "This profile can't be reached for now. Try again in a moment.",
    seeProfile: "See profile and tasks",
  },
  fr: {
    profile: "Profil",
    hidePanel: "Masquer le panneau",
    unavailable: "Profil indisponible",
    unavailableText: "Ce profil est injoignable pour le moment. Réessaie dans un instant.",
    seeProfile: "Voir le profil et les tâches",
  },
});

/** Side panel of a direct conversation with a colleague: who they are. */
export function PersonPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const { data: person, error, refetch } = useQuery(userProfileQuery(userId));
  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <PanelBar closeLabel={t.hidePanel} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {error ? (
          <Empty className="mt-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserIcon />
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

/** Photo, name, role and handle, aligned like the bot's panel. */
function Identity({ person }: { person: UserProfile }) {
  const subtitle = [person.title, person.username && `@${person.username}`].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col items-start gap-1">
      <PersonAvatar person={person} className="mb-2 size-16" />
      <h2 className="max-w-full truncate text-xl font-medium">{person.name}</h2>
      {subtitle && <p className="max-w-full truncate text-sm text-muted-foreground">{subtitle}</p>}
      {/* The status is already under the name in the conversation's header. */}
    </div>
  );
}
