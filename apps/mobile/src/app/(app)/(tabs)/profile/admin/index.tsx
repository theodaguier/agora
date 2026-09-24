import { Link, Stack, type Href } from "expo-router";
import { ListGroup } from "heroui-native";
import { AdminGate, PressableRow, Section, SettingsScroll } from "@/components/admin/ui";
import { BotIcon, BrainIcon, BuildingIcon, CheckCircleIcon, FileTextIcon, KeyIcon, LayersIcon, PlugIcon, RefreshIcon, UsersIcon, type IconComponent } from "@/components/icons";
import { defineMessages } from "@/lib/i18n";

/* The admin tabs of apps/web/src/components/Settings.tsx, as an iOS settings menu. */

const messages = defineMessages({
  en: {
    title: "Administration",
    organization: "Organization",
    organizationHelp: "Name, logo, language, time zone",
    users: "Users & invitations",
    usersHelp: "Invite, roles",
    access: "Access",
    accessHelp: "Which agents each employee can use",
    agents: "Agents",
    agentsHelp: "Profiles, skills, tools",
    models: "Models",
    modelsHelp: "Allowed models, local models, CLIs",
    memory: "Memory",
    memoryHelp: "The organization's shared memory",
    digest: "Recaps",
    digestHelp: "Morning recap of the previous day",
    status: "Status",
    statusHelp: "Health of every component",
    integrations: "Integrations",
    integrationsHelp: "Emails, brand logos",
    updates: "Updates",
    updatesHelp: "Versions and history",
    team: "Team",
    ai: "Agents & AI",
    instance: "Instance",
  },
  fr: {
    title: "Administration",
    organization: "Organisation",
    organizationHelp: "Nom, logo, langue, fuseau horaire",
    users: "Utilisateurs et invitations",
    usersHelp: "Inviter, rôles",
    access: "Accès",
    accessHelp: "Quels agents chaque salarié peut utiliser",
    agents: "Agents",
    agentsHelp: "Profils, compétences, outils",
    models: "Modèles",
    modelsHelp: "Modèles autorisés, modèles locaux, CLI",
    memory: "Mémoire",
    memoryHelp: "La mémoire partagée de l'organisation",
    digest: "Récaps",
    digestHelp: "Récap du matin sur la veille",
    status: "Statut",
    statusHelp: "L'état de chaque composant",
    integrations: "Intégrations",
    integrationsHelp: "Emails, logos des marques",
    updates: "Mises à jour",
    updatesHelp: "Versions et historique",
    team: "Équipe",
    ai: "Agents et IA",
    instance: "Instance",
  },
});

type Entry = { href: string; icon: IconComponent; title: string; help: string };

export default function Administration() {
  const t = messages;
  const groups: { title: string; entries: Entry[] }[] = [
    {
      title: t.team,
      entries: [
        { href: "/profile/admin/organization", icon: BuildingIcon, title: t.organization, help: t.organizationHelp },
        { href: "/profile/admin/users", icon: UsersIcon, title: t.users, help: t.usersHelp },
        { href: "/profile/admin/access", icon: KeyIcon, title: t.access, help: t.accessHelp },
      ],
    },
    {
      title: t.ai,
      entries: [
        { href: "/profile/admin/agents", icon: BotIcon, title: t.agents, help: t.agentsHelp },
        { href: "/profile/admin/models", icon: LayersIcon, title: t.models, help: t.modelsHelp },
        { href: "/profile/admin/memory", icon: BrainIcon, title: t.memory, help: t.memoryHelp },
        { href: "/profile/admin/recaps", icon: FileTextIcon, title: t.digest, help: t.digestHelp },
      ],
    },
    {
      title: t.instance,
      entries: [
        { href: "/profile/admin/integrations", icon: PlugIcon, title: t.integrations, help: t.integrationsHelp },
        { href: "/profile/admin/status", icon: CheckCircleIcon, title: t.status, help: t.statusHelp },
        { href: "/profile/admin/updates", icon: RefreshIcon, title: t.updates, help: t.updatesHelp },
      ],
    },
  ];

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <SettingsScroll>
          {groups.map((g) => (
            <Section key={g.title} title={g.title}>
              {g.entries.map((e) => (
                <Link key={e.href} href={e.href as Href} asChild>
                  <PressableRow>
                    <ListGroup.ItemPrefix>
                      <e.icon className="size-6 text-accent" />
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle>{e.title}</ListGroup.ItemTitle>
                      <ListGroup.ItemDescription>{e.help}</ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix />
                  </PressableRow>
                </Link>
              ))}
            </Section>
          ))}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
