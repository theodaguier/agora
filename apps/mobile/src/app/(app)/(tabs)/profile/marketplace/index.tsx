import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Card, LinkButton, PressableFeedback, SearchField, Spinner, Tabs, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { AdminGate, ErrorAlert, LoadingRows, Section as ListSection, SectionTitle, SettingsScroll } from "@/components/admin/ui";
import { ItemRow } from "@/components/marketplace/item-row";
import { RestartBanner } from "@/components/marketplace/restart-banner";
import { sectionTitles, useMarket, type Section } from "@/components/marketplace/use-market";
import { useMe } from "@/components/server-scope";
import { adminUsersQuery, type AdminAgent } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { customConnectorHref, installedHref, sectionHref, type Item } from "@/lib/marketplace";
import { agentsQuery, conversationsQuery } from "@/lib/queries";
import { MenuButton } from "@/components/menus";

/* apps/web/src/components/marketplace/Marketplace.tsx: its blocks become segments of inset grouped sections, its "Show all" a screen; the search is a HeroUI SearchField. */

type Segment = "connectors" | "skills" | "plugins" | "bots";

const SEGMENTS = ["connectors", "skills", "plugins", "bots"] as const;

const SECTIONS: Record<Exclude<Segment, "bots">, Section[]> = {
  connectors: ["mcp", "registry"],
  skills: ["skill", "skillsSh"],
  plugins: ["plugin"],
};

const t = defineMessages<{
  segments: Record<Segment, string>;
  title: string;
  installed: (n: number) => string;
  searchPlaceholder: string;
  nothingFound: (q: string) => string;
  nothingHere: string;
  opening: string;
  profile: (name: string) => string;
  custom: string;
  more: string;
  showAll: (n: number) => string;
}>({
  en: {
    segments: { connectors: "Connectors", skills: "Skills", plugins: "Plugins", bots: "Bots" },
    title: "Marketplace",
    installed: (n) => `Installed: ${n}`,
    searchPlaceholder: "Search connectors, skills, plugins and bots",
    nothingFound: (q) => `Nothing found for “${q}”.`,
    nothingHere: "Nothing in this tab. Results in:",
    opening: "Opening…",
    profile: (name) => `Profile ${name}`,
    custom: "Custom connector",
    more: "More",
    showAll: (n) => `Show all (${n})`,
  },
  fr: {
    segments: { connectors: "Connecteurs", skills: "Skills", plugins: "Plugins", bots: "Bots" },
    title: "Marketplace",
    installed: (n) => `Installés : ${n}`,
    searchPlaceholder: "Rechercher des connecteurs, skills, plugins et bots",
    nothingFound: (q) => `Rien trouvé pour « ${q} ».`,
    nothingHere: "Rien dans cet onglet. Résultats dans :",
    opening: "Ouverture…",
    profile: (name) => `Profil ${name}`,
    custom: "Connecteur personnalisé",
    more: "Plus",
    showAll: (n) => `Tout voir (${n})`,
  },
});

export default function MarketplaceScreen() {
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <Marketplace />
      </AdminGate>
    </>
  );
}

/** Rows per section: the rest is behind "Show all", as on the web. */
const PREVIEW = 6;

function Marketplace() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("connectors");
  const market = useMarket(query);
  const searching = query.trim().length > 0;
  // While searching, each tab shows how many results it holds: the search spans every tab.
  const counts: Record<Segment, number> = {
    connectors: SECTIONS.connectors.reduce((n, s) => n + market.items[s].length, 0),
    skills: SECTIONS.skills.reduce((n, s) => n + market.items[s].length, 0),
    plugins: SECTIONS.plugins.reduce((n, s) => n + market.items[s].length, 0),
    bots: market.bots.length,
  };
  const elsewhere = SEGMENTS.filter((s) => s !== segment && counts[s] > 0);
  const sections = segment === "bots" ? [] : SECTIONS[segment].filter((s) => market.items[s].length || market.pending[s]);
  const empty = segment === "bots" ? !market.bots.length : sections.every((s) => !market.items[s].length && !market.pending[s]);

  // An empty tab points to the tabs that do have results, as the web shows every section at once.
  const nothing =
    searching &&
    !market.searching &&
    empty &&
    (elsewhere.length ? (
      <View className="items-center gap-1 px-8 py-6">
        <Typography.Paragraph type="body-sm" color="muted" align="center">
          {t.nothingHere}
        </Typography.Paragraph>
        {elsewhere.map((s) => (
          <LinkButton key={s} size="sm" onPress={withTap(() => setSegment(s))}>
            <LinkButton.Label>{`${t.segments[s]} (${counts[s]})`}</LinkButton.Label>
          </LinkButton>
        ))}
      </View>
    ) : (
      <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-8 py-6">
        {t.nothingFound(query.trim())}
      </Typography.Paragraph>
    ));

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <MenuButton
            icon="ellipsis"
            label={t.more}
            actions={[
              { label: t.installed(market.installedCount), icon: "checkmark.circle", onPress: () => router.push(installedHref) },
              { label: t.custom, icon: "plus.circle", onPress: () => router.push(customConnectorHref) },
            ]}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <SettingsScroll onRefresh={market.refetch}>
        <View className="gap-4">
          <SearchField value={query} onChange={setQuery}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={t.searchPlaceholder} accessibilityLabel={t.searchPlaceholder} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Tabs value={segment} onValueChange={(v) => (haptic.select(), setSegment(v as Segment))}>
            <Tabs.List>
              <Tabs.Indicator />
              {SEGMENTS.map((s) => (
                <Tabs.Trigger key={s} value={s}>
                  <Tabs.Label>{searching && !market.searching ? `${t.segments[s]} ${counts[s]}` : t.segments[s]}</Tabs.Label>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs>
        </View>
        {searching && market.searching && <Spinner size="sm" className="self-center" />}
        <RestartBanner />
        <ErrorAlert error={market.error} />
        {segment === "bots" && market.bots.length > 0 && <BotCards agents={market.bots} />}
        {sections.map((section) => (
          <ItemSection
            key={section}
            section={section}
            items={market.items[section]}
            loading={!!market.pending[section]}
            query={query.trim()}
          />
        ))}
        {nothing}
      </SettingsScroll>
    </>
  );
}

/**
 * A catalog as an inset grouped HeroUI ListGroup: its first rows only, the rest behind "Show all"
 * (a virtualized screen), so a tab never mounts hundreds of rows.
 */
function ItemSection({ section, items, loading, query }: { section: Section; items: Item[]; loading: boolean; query: string }) {
  const router = useRouter();
  // The custom connector lives in the header's "More" menu, not here.
  const action = items.length > PREVIEW && (
    <LinkButton size="sm" onPress={withTap(() => router.push(sectionHref(section, query)))}>
      <LinkButton.Label>{t.showAll(items.length)}</LinkButton.Label>
    </LinkButton>
  );
  if (!items.length && loading)
    return (
      <View className="gap-2">
        <SectionTitle>{sectionTitles[section]}</SectionTitle>
        <LoadingRows rows={4} />
      </View>
    );
  return (
    <ListSection title={sectionTitles[section]} action={action || undefined}>
      {items.slice(0, PREVIEW).map((item) => (
        <ItemRow key={item.key} item={item} />
      ))}
    </ListSection>
  );
}

/** Team bots: opening one starts a conversation with it, after giving the admin access if needed. */
function BotCards({ agents }: { agents: (AdminAgent & { description: string })[] }) {
  const qc = useQueryClient();
  const router = useRouter();
  const me = useMe();
  const { data: mine = [] } = useQuery(agentsQuery);
  const [opening, setOpening] = useState<string | null>(null);

  const open = (agent: AdminAgent) => {
    setOpening(agent.id);
    const go = async () => {
      if (!mine.some((m) => m.id === agent.id)) {
        // The admin doesn't have this bot yet: add it to themselves before opening the thread.
        const users = await qc.fetchQuery(adminUsersQuery);
        const current = users.find((u) => u.id === me.id)?.agents ?? [];
        await api(`/admin/users/${me.id}/agents`, { method: "PUT", body: JSON.stringify({ agentIds: [...current, agent.id] }) });
        await qc.invalidateQueries({ queryKey: agentsQuery.queryKey });
      }
      const { id } = await api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify({ agentId: agent.id }) });
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      router.push({ pathname: "/c/[conversationId]", params: { conversationId: id } });
    };
    return go().finally(() => setOpening(null));
  };

  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {agents.map((a) => (
        // A pressable Card, as HeroUI's PressableFeedback "card" examples: a light scale and a highlight.
        <PressableFeedback
          key={a.id}
          className="w-[48%]"
          animation={{ scale: { value: 0.98 } }}
          isDisabled={!!opening}
          accessibilityRole="button"
          accessibilityLabel={`${a.name}, ${opening === a.id ? t.opening : t.profile(a.hermesProfile)}`}
          onPress={withTap(() => void open(a))}
        >
          <Card className="items-center">
            <Card.Header>
              <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} size={72} />
            </Card.Header>
            <Card.Body className="items-center">
              <Card.Title numberOfLines={1}>{a.name}</Card.Title>
              <Card.Description numberOfLines={1}>{opening === a.id ? t.opening : t.profile(a.hermesProfile)}</Card.Description>
            </Card.Body>
          </Card>
          <PressableFeedback.Highlight />
        </PressableFeedback>
      ))}
    </View>
  );
}
