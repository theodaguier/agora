import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { defineMessages, getLocale, useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { latestRelease, setWhatsNewOpen, useWhatsNewOpen } from "@/lib/whats-new";

const messages = defineMessages({
  en: {
    title: (date: string) => `Changelog — ${date}`,
    release: "Release",
    changes: "What changed",
    tags: { feature: "New feature", bugfix: "Bug fix", refactor: "Refactor", migration: "Migration" },
    by: (author: string) => `by ${author}`,
    skip: "Skip",
    learnMore: "Learn more",
    close: "Close",
  },
  fr: {
    title: (date: string) => `Changelog — ${date}`,
    release: "Version",
    changes: "Ce qui change",
    tags: { feature: "Nouveauté", bugfix: "Correctif", refactor: "Refonte", migration: "Migration" },
    by: (author: string) => `par ${author}`,
    skip: "Passer",
    learnMore: "En savoir plus",
    close: "Fermer",
  },
});

/** Background of a cover without an image; shared with the morning recap. */
export const coverGradient =
  "radial-gradient(ellipse at 20% 0%, oklch(0.62 0.16 285 / 0.28), transparent 60%), radial-gradient(ellipse at 90% 100%, oklch(0.7 0.12 210 / 0.2), transparent 55%)";

/** Remembered on the account, so the same release doesn't open again on another device. */
const markSeen = (version: string) => api("/me/release-notes", { method: "PUT", body: JSON.stringify({ id: version }) }).catch(() => {});

/** Handled once per page load: the session in the route context isn't refreshed after markSeen. */
let checked = false;

/** "What's new" dialog: opens once per release, then from the user menu. Mounted once in the shell. */
export function WhatsNew() {
  const { user } = useRouteContext({ from: "/app" });
  const open = useWhatsNewOpen();
  const t = useT(messages);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (checked || !latestRelease || user.releaseNotesSeen === latestRelease.version) return;
    checked = true;
    // An account created after the release already has these features: nothing new to show.
    if (new Date(user.createdAt) >= new Date(latestRelease.date)) markSeen(latestRelease.version);
    else setWhatsNewOpen(true);
  }, [user]);

  useEffect(() => {
    if (open) setExpanded(false);
  }, [open]);

  if (!latestRelease) return null;
  const release = latestRelease;
  const locale = getLocale();
  const date = new Date(`${release.date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const close = () => {
    setWhatsNewOpen(false);
    if (user.releaseNotesSeen !== release.version) markSeen(release.version);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {/* Same frame as the morning recap: title and buttons stay put, everything between them scrolls on a short screen. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" initialFocus={false}>
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="pr-8 text-xl font-semibold tracking-tight">{t.title(date)}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pb-6">
          {/* Capped so it never takes the whole screen; shrinks once the details are shown. */}
          <div
            className={cn(
              "relative w-full shrink-0 overflow-hidden rounded-lg bg-muted transition-[aspect-ratio] duration-200 ease-out",
              expanded ? "aspect-[4/1]" : "aspect-video max-h-[32dvh]",
            )}
          >
            {release.cover ? (
              <img src={release.cover} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ backgroundImage: coverGradient }}>
                <span className={cn("font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase", expanded && "hidden")}>{t.release}</span>
                <span className={cn("font-medium tracking-tight tabular-nums", expanded ? "text-3xl" : "text-4xl sm:text-5xl")}>v{release.version}</span>
              </div>
            )}
          </div>
          <DialogDescription className="text-base text-pretty text-foreground">{release.summary[locale]}</DialogDescription>
          <div className="flex flex-wrap gap-1.5">
            {release.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {t.tags[tag]}
              </Badge>
            ))}
          </div>
          {expanded && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t.changes}</h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground marker:text-muted-foreground/50">
                {release.details[locale].map((line) => (
                  <li key={line} className="text-pretty">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-sm text-muted-foreground">{t.by(release.author)}</p>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-2xl px-6">
          {expanded ? (
            <Button onClick={close}>{t.close}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                {t.skip}
              </Button>
              <Button onClick={() => setExpanded(true)}>{t.learnMore}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
