import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { SearchIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    title: "Agora isn't responding",
    text: "The server couldn't be reached. Check your connection, then try again.",
    notFound: "Page not found",
    notFoundText: "This link leads nowhere, or the page has moved.",
    home: "Back to Agora",
  },
  fr: {
    title: "Agora ne répond pas",
    text: "Le serveur est injoignable. Vérifie ta connexion, puis réessaie.",
    notFound: "Page introuvable",
    notFoundText: "Ce lien ne mène nulle part, ou la page a changé d'adresse.",
    home: "Retour à Agora",
  },
});

/** A page still loading (the session checked, a screen fetched): a spinner, never a blank window. */
export function RoutePending() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <Spinner />
    </div>
  );
}

/** A page that couldn't load: what happened and a way to try again, instead of a blank window. */
export function RouteError({ error }: ErrorComponentProps) {
  const t = useT(messages);
  const c = useT(common);
  const router = useRouter();
  return (
    <Empty className="h-dvh bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WarningIcon />
        </EmptyMedia>
        <EmptyTitle>{t.title}</EmptyTitle>
        <EmptyDescription title={error instanceof Error ? error.message : undefined}>{t.text}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => void router.invalidate()}>{c.retry}</Button>
      </EmptyContent>
    </Empty>
  );
}

/** A URL that matches no page: say so and lead home, instead of a bare « Not Found ». */
export function RouteNotFound() {
  const t = useT(messages);
  return (
    <Empty className="h-dvh bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>{t.notFound}</EmptyTitle>
        <EmptyDescription>{t.notFoundText}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button nativeButton={false} render={<Link to="/" />}>
          {t.home}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
