import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { ArtifactShareMode, ArtifactSummary } from "@agora/core";
import { common } from "@agora/core/i18n";
import { BuildingIcon, ChevronLeftIcon, FileCodeIcon, GlobeIcon, LockIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
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
    modes: { private: "Conversation", org: "Organization", link: "Anyone with the link" } satisfies Record<ArtifactShareMode, string>,
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
    modes: { private: "Conversation", org: "Organisation", link: "Toute personne disposant du lien" },
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
          <header>
            <h1 className="text-xl font-medium">{t.title}</h1>
            {!!artifacts?.length && <p className="mt-1 text-sm text-muted-foreground">{t.count(artifacts.length)}</p>}
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
              <ItemGroup role="list" className="gap-1">
                {artifacts.map((a) => (
                  <ArtifactRow key={a.id} artifact={a} />
                ))}
              </ItemGroup>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** An artifact: its title, where it was written and its version, who its link opens to. */
function ArtifactRow({ artifact }: { artifact: ArtifactSummary }) {
  const t = useT(messages);
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = conversations?.find((x) => x.id === artifact.conversationId);
  const Mode = MODE_ICON[artifact.shareMode];
  return (
    <Item size="sm" role="listitem" className="flex-nowrap" render={<Link to="/artifacts/$artifactId" params={{ artifactId: artifact.id }} />}>
      <ItemMedia variant="icon" className="text-muted-foreground">
        <FileCodeIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">{artifact.title || t.title}</ItemTitle>
        <ItemDescription className="truncate">
          {[conv && conversationTitle(conv, user.id), t.version(artifact.version), listTime(new Date(artifact.updatedAt))].filter(Boolean).join(" · ")}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="shrink-0 text-xs text-muted-foreground">
        <Mode className="size-3.5" />
        <span className="hidden sm:inline">{t.modes[artifact.shareMode]}</span>
      </ItemActions>
    </Item>
  );
}
