import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { ArtifactShareMode, ArtifactSummary } from "@agora/core";
import { common } from "@agora/core/i18n";
import { BuildingIcon, ChevronLeftIcon, FileCodeIcon, GlobeIcon, LockIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ConversationAvatar } from "@/components/ConversationAvatar";
import { ArtifactPageFrame, ArtifactTile, useOpenArtifact } from "@/components/Preview";
import { ArtifactActionsMenu } from "@/components/ArtifactActions";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { artifactsQuery } from "@/lib/artifacts";
import { listTime } from "@/lib/dates";
import { useOrgTitle } from "@/lib/org";
import { conversationTitle } from "@/lib/participants";
import { conversationsQuery } from "@/lib/queries";

const messages = defineMessages({
  en: {
    title: "Artifacts",
    back: "Back",
    count: (n: number) => `${n} artifact${n > 1 ? "s" : ""}`,
    version: (n: number) => `v${n}`,
    modes: { private: "Only this conversation can open it", org: "Everyone in the organization can open it", link: "Anyone with the link can open it" } satisfies Record<ArtifactShareMode, string>,
    emptyTitle: "No artifact yet",
    empty: "Ask a bot for a page, a dashboard or a small tool: what it writes shows up here, ready to share.",
    errorTitle: "Artifacts unreachable",
    error: "They couldn't be loaded for now. Try again in a moment.",
  },
  fr: {
    title: "Artefacts",
    back: "Retour",
    count: (n: number) => `${n} artefact${n > 1 ? "s" : ""}`,
    version: (n: number) => `v${n}`,
    modes: { private: "Seule cette conversation peut l'ouvrir", org: "Toute l'organisation peut l'ouvrir", link: "Toute personne disposant du lien peut l'ouvrir" },
    emptyTitle: "Aucun artefact",
    empty: "Demande à un bot une page, un tableau de bord ou un petit outil : ce qu'il écrit arrive ici, prêt à partager.",
    errorTitle: "Artefacts injoignables",
    error: "Ils n'ont pas pu être chargés pour le moment. Réessaie dans un instant.",
  },
});

const MODE_ICON = { private: LockIcon, org: BuildingIcon, link: GlobeIcon } satisfies Record<ArtifactShareMode, unknown>;

/** Every page the bots wrote in the reader's conversations, the latest changed first; each opens in a tab of its own. */
export function Artifacts() {
  const t = useT(messages);
  const c = useT(common);
  useOrgTitle(t.title);
  const { data: artifacts, isPending, isError, refetch } = useQuery(artifactsQuery);
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-6 pb-12 md:pt-10">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/" aria-label={t.back} />} className="-ml-2 mb-2 md:hidden">
            <ChevronLeftIcon />
          </Button>
          <header className="flex items-baseline gap-2">
            <h1 className="text-xl font-medium">{t.title}</h1>
            {!!artifacts?.length && <span className="text-xl text-subtle-foreground tabular-nums">{artifacts.length}</span>}
          </header>
          <div className="mt-5">
            {isPending ? (
              <div className="grid place-items-center py-16">
                <Spinner />
              </div>
            ) : isError ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WarningIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t.errorTitle}</EmptyTitle>
                  <EmptyDescription>{t.error}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="secondary" onClick={() => void refetch()}>
                    {c.retry}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : !artifacts.length ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileCodeIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t.emptyTitle}</EmptyTitle>
                  <EmptyDescription>{t.empty}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {artifacts.map((a) => (
                  <li key={a.id}>
                    <GalleryTile artifact={a} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** An artifact in the gallery: its card, with the conversation it was written in and when. */
function GalleryTile({ artifact }: { artifact: ArtifactSummary }) {
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = conversations?.find((x) => x.id === artifact.conversationId);
  const open = useOpenArtifact();
  return (
    <ArtifactTile
      title={artifact.title}
      artifactId={artifact.id}
      page={(style) => <ArtifactPageFrame artifactId={artifact.id} title={artifact.title} style={style} />}
      onOpen={() => open(artifact.id)}
      meta={
        <>
          {conv && <ConversationAvatar conversation={conv} me={user.id} className="size-4" />}
          <span className="min-w-0 truncate">{conv ? conversationTitle(conv, user.id) : ""}</span>
          <span className="ml-auto shrink-0 tabular-nums text-subtle-foreground">{listTime(new Date(artifact.updatedAt))}</span>
        </>
      }
    />
  );
}
