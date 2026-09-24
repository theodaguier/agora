import { useQuery } from "@tanstack/react-query";
import { Link, Stack, type Href } from "expo-router";
import { Chip, ListGroup } from "heroui-native";
import { AdminGate, SettingsScroll, Intro, PressableRow, Section } from "@/components/admin/ui";
import { BrainIcon, FileTextIcon, LockIcon, type IconComponent } from "@/components/icons";
import { defineMessages } from "@/lib/i18n";
import { companyMemoryHref, companyMemoryQuery, vaultHref, vaultQuery, wikiGraphQuery, wikiHref } from "@/lib/memory";

/* The web's "Memory" and "Vault" settings tabs, plus the shared memory every agent reads. */

const t = defineMessages({
  en: {
    title: "Memory",
    intro: "What the agents know about the organization, and the credentials they work with.",
    knowledge: "Knowledge",
    company: "Shared memory",
    companyHelp: "Read by every agent, on every message",
    chars: (n: number, max: number) => `${n.toLocaleString("en")} / ${max.toLocaleString("en")} characters`,
    wiki: "Second brain",
    wikiHelp: "The agents' shared wiki",
    pages: (n: number) => (n === 1 ? "1 page" : `${n} pages`),
    compiling: "Compiling",
    secrets: "Credentials",
    vault: "Vault",
    vaultHelp: "API keys, tokens, passwords",
    keys: (n: number) => (n === 1 ? "1 credential" : `${n} credentials`),
  },
  fr: {
    title: "Mémoire",
    intro: "Ce que les agents savent de l'organisation, et les accès avec lesquels ils travaillent.",
    knowledge: "Connaissances",
    company: "Mémoire partagée",
    companyHelp: "Lue par chaque agent, à chaque message",
    chars: (n: number, max: number) => `${n.toLocaleString("fr")} / ${max.toLocaleString("fr")} caractères`,
    wiki: "Second cerveau",
    wikiHelp: "Le wiki commun des agents",
    pages: (n: number) => `${n} page${n > 1 ? "s" : ""}`,
    compiling: "Compilation",
    secrets: "Accès",
    vault: "Coffre",
    vaultHelp: "Clés d'API, jetons, mots de passe",
    keys: (n: number) => `${n} credential${n > 1 ? "s" : ""}`,
  },
});

export default function MemoryScreen() {
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <MemoryHub />
      </AdminGate>
    </>
  );
}

function MemoryHub() {
  const company = useQuery(companyMemoryQuery);
  const graph = useQuery(wikiGraphQuery);
  const vault = useQuery(vaultQuery);
  const pages = graph.data?.nodes.filter((n) => n.id.startsWith("wiki/")).length;

  const row = (href: Href, Icon: IconComponent, title: string, detail: string, badge?: string) => (
    <Link href={href} asChild>
      <PressableRow>
        <ListGroup.ItemPrefix>
          <Icon className="size-6 text-accent" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription numberOfLines={1}>{detail}</ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        {badge && (
          <Chip size="sm" variant="soft" color="accent">
            <Chip.Label>{badge}</Chip.Label>
          </Chip>
        )}
        <ListGroup.ItemSuffix />
      </PressableRow>
    </Link>
  );

  return (
    <SettingsScroll onRefresh={() => Promise.all([company.refetch(), graph.refetch(), vault.refetch()])}>
      <Intro>{t.intro}</Intro>
      <Section title={t.knowledge}>
        {row(companyMemoryHref, FileTextIcon, t.company, company.data ? t.chars(company.data.value.length, company.data.max) : t.companyHelp)}
        {row(wikiHref, BrainIcon, t.wiki, pages !== undefined ? t.pages(pages) : t.wikiHelp, graph.data?.status.running ? t.compiling : undefined)}
      </Section>
      <Section title={t.secrets}>{row(vaultHref, LockIcon, t.vault, vault.data ? t.keys(vault.data.length) : t.vaultHelp)}</Section>
    </SettingsScroll>
  );
}
