import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Accordion, Chip, Typography } from "heroui-native";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useMeProfile } from "@/components/profile/me";
import { defineMessages, locale } from "@/lib/i18n";
import { sessionQuery } from "@/lib/queries";
import { latestRelease, markReleaseSeen, RELEASES } from "@/lib/whats-new";

/* apps/web/src/components/WhatsNew.tsx: the same releases, newest first, one per HeroUI Accordion panel. */

const messages = defineMessages({
  en: {
    title: "What's new",
    changelog: (date: string) => `Changelog — ${date}`,
    release: "Release",
    changes: "What changed",
    tags: { feature: "New feature", bugfix: "Bug fix", refactor: "Refactor", migration: "Migration" },
    by: (author: string) => `by ${author}`,
  },
  fr: {
    title: "Nouveautés",
    changelog: (date: string) => `Changelog — ${date}`,
    release: "Version",
    changes: "Ce qui change",
    tags: { feature: "Nouveauté", bugfix: "Correctif", refactor: "Refonte", migration: "Migration" },
    by: (author: string) => `par ${author}`,
  },
});

export function WhatsNew() {
  const t = messages;
  const me = useMeProfile();
  const qc = useQueryClient();

  // Seen here: the web won't open it again.
  useEffect(() => {
    if (!latestRelease || me.releaseNotesSeen === latestRelease.version) return;
    markReleaseSeen(latestRelease.version).then(() => qc.invalidateQueries({ queryKey: sessionQuery.queryKey }));
  }, [me.releaseNotesSeen, qc]);

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="px-4 pb-12 pt-4">
        {/* One release per HeroUI Accordion panel, the newest open. */}
        <Accordion selectionMode="multiple" variant="surface" defaultValue={RELEASES[0] ? [RELEASES[0].version] : []}>
          {RELEASES.map((release) => {
            const date = new Date(`${release.date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
            return (
              <Accordion.Item key={release.version} value={release.version}>
                <Accordion.Trigger>
                  <View className="flex-1 gap-0.5">
                    <Typography.Paragraph weight="medium">
                      {t.release} {release.version}
                    </Typography.Paragraph>
                    <Typography.Paragraph type="body-sm" color="muted">
                      {t.changelog(date)}
                    </Typography.Paragraph>
                  </View>
                  <Accordion.Indicator />
                </Accordion.Trigger>
                <Accordion.Content>
                  <View className="gap-3">
                    <Typography.Paragraph>{release.summary[locale]}</Typography.Paragraph>
                    <View className="flex-row flex-wrap gap-1.5">
                      {release.tags.map((tag) => (
                        <Chip key={tag} variant="secondary" color="default" size="sm">
                          {t.tags[tag]}
                        </Chip>
                      ))}
                    </View>
                    <Typography.Heading type="h6">{t.changes}</Typography.Heading>
                    <View className="gap-2">
                      {release.details[locale].map((line) => (
                        <View key={line} className="flex-row gap-2.5">
                          <Typography.Paragraph color="muted">•</Typography.Paragraph>
                          <Typography.Paragraph color="muted" className="flex-1">
                            {line}
                          </Typography.Paragraph>
                        </View>
                      ))}
                    </View>
                    <Typography.Paragraph type="body-sm" color="muted">
                      {t.by(release.author)}
                    </Typography.Paragraph>
                  </View>
                </Accordion.Content>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </ScrollView>
    </>
  );
}
