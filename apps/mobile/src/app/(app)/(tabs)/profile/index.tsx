import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
import { Link, router, Stack, useFocusEffect, type Href } from "expo-router";
import { Chip, ListGroup } from "heroui-native";
import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { PersonAvatar } from "@/components/conversation-avatar";
import {
  BellIcon,
  BotIcon,
  BrainIcon,
  BuildingIcon,
  CalendarClockIcon,
  ChartIcon,
  CheckCircleIcon,
  FileTextIcon,
  KeyIcon,
  LayersIcon,
  MoonIcon,
  PackageIcon,
  PaletteIcon,
  PlugIcon,
  RefreshIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  MonitorIcon,
  UsersIcon,
  type IconComponent,
} from "@/components/icons";
import { LinkRow, PressableRow, Section, SettingsRow, SettingsScroll } from "@/components/admin/ui";
import { useDnd } from "@/components/profile/dnd";
import { useMeProfile } from "@/components/profile/me";
import { organizationsMessages } from "@/components/profile/organizations-messages";
import { ConnectedPhones } from "@/components/admin/connected-phones";
import { useTheme } from "@/components/profile/theme";
import { useServer } from "@/components/server-scope";
import { digestQuery } from "@/lib/digest";
import { serverVersionQuery } from "@/lib/queries";
import { defineMessages } from "@/lib/i18n";
import { latestRelease } from "@/lib/whats-new";
import { notificationStatus, syncPushToken } from "@/lib/notifications";
import { TapMenu } from "@/components/menus";
import { twoFactorMessages } from "@/components/two-factor";

/*
 * apps/web/src/components/Settings.tsx's navigation at phone width, with the web's user and workspace
 * menus: you (General), your status, the Account tabs, the workspace, then (admins) the Organization and
 * Instance tabs, each one group of rows with its icon in a tile.
 */

const messages = defineMessages({
  en: {
    title: "Profile",
    admin: "Admin",
    dnd: "Do not disturb",
    off: "Off",
    notifications: "Notifications",
    on: "On",
    themes: { system: "System", light: "Light", dark: "Dark" },
    digest: "Morning recap",
    unread: "New",
    whatsNew: "What's new",
    marketplace: "Marketplace",
    organizations: "Organizations",
    about: "About",
    appVersion: "App",
    serverVersion: "Server",
    engineVersion: "Hermes engine",
    groups: { account: "Account", organization: "Organization", instance: "Instance" },
    tabs: {
      security: "Security",
      availability: "Availability",
      appearance: "Appearance",
      usage: "Usage",
      organization: "Organization",
      users: "Users",
      agents: "Agents",
      access: "Access",
      integrations: "Integrations",
      models: "Models",
      memory: "Memory",
      digest: "Recaps",
      status: "Status",
      server: "Server",
      machines: "SSH machines",
      updates: "Updates",
    },
  },
  fr: {
    title: "Profil",
    admin: "Admin",
    dnd: "Ne pas déranger",
    off: "Désactivé",
    notifications: "Notifications",
    on: "Activées",
    themes: { system: "Système", light: "Clair", dark: "Sombre" },
    digest: "Récap du matin",
    unread: "Nouveau",
    whatsNew: "Nouveautés",
    marketplace: "Marketplace",
    organizations: "Organisations",
    about: "À propos",
    appVersion: "Application",
    serverVersion: "Serveur",
    engineVersion: "Moteur Hermes",
    groups: { account: "Compte", organization: "Organisation", instance: "Instance" },
    tabs: {
      security: "Sécurité",
      availability: "Disponibilité",
      appearance: "Apparence",
      usage: "Consommation",
      organization: "Organisation",
      users: "Utilisateurs",
      agents: "Agents",
      access: "Accès",
      integrations: "Intégrations",
      models: "Modèles",
      memory: "Mémoire",
      digest: "Récaps",
      status: "Statut",
      server: "Serveur",
      machines: "Machines SSH",
      updates: "Mises à jour",
    },
  },
});

type Tab = { href: string; icon: IconComponent; title: string };

/** The signed-in person's settings: the web's Settings navigation, user menu and workspace menu. */
export default function Profile() {
  const t = { ...messages, orgs: organizationsMessages };
  const me = useMeProfile();
  const server = useServer();
  const dnd = useDnd(me.id);
  const theme = useTheme();
  const { data: digest } = useQuery(digestQuery);
  const { data: versions } = useQuery(serverVersionQuery);
  const appVersion = [Application.nativeApplicationVersion, Application.nativeBuildVersion && `(${Application.nativeBuildVersion})`].filter(Boolean).join(" ");
  const admin = me.role === "admin";
  const notifications = useNotificationStatus();
  const subtitle = [me.title, admin ? t.admin : null].filter(Boolean).join(" · ");
  const unread = (show: boolean) =>
    show ? (
      <Chip size="sm" variant="primary" color="accent">
        {t.unread}
      </Chip>
    ) : null;

  // The web's admin-only tabs, in its two groups.
  const adminGroups: { title: string; tabs: Tab[] }[] = [
    {
      title: t.groups.organization,
      tabs: [
        { href: "/profile/admin/organization", icon: BuildingIcon, title: t.tabs.organization },
        { href: "/profile/admin/users", icon: UsersIcon, title: t.tabs.users },
        { href: "/profile/admin/agents", icon: BotIcon, title: t.tabs.agents },
        { href: "/profile/admin/access", icon: KeyIcon, title: t.tabs.access },
        { href: "/profile/admin/integrations", icon: PlugIcon, title: t.tabs.integrations },
        { href: "/profile/admin/models", icon: LayersIcon, title: t.tabs.models },
        { href: "/profile/admin/memory", icon: BrainIcon, title: t.tabs.memory },
        { href: "/profile/admin/recaps", icon: FileTextIcon, title: t.tabs.digest },
      ],
    },
    {
      title: t.groups.instance,
      tabs: [
        { href: "/profile/admin/status", icon: CheckCircleIcon, title: t.tabs.status },
        { href: "/profile/admin/server", icon: ServerIcon, title: t.tabs.server },
        { href: "/profile/admin/machines", icon: MonitorIcon, title: t.tabs.machines },
        { href: "/profile/admin/updates", icon: RefreshIcon, title: t.tabs.updates },
      ],
    },
  ];

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <SettingsScroll>
        {/* You: the General tab (profile and account). */}
        <Section>
          <PressableRow onPress={() => router.push("/profile/edit")} accessibilityLabel={[me.name, subtitle, me.email].filter(Boolean).join(", ")}>
            <ListGroup.ItemPrefix>
              <PersonAvatar person={{ id: me.id, name: me.name, image: me.image }} size={48} />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle numberOfLines={1}>{me.name}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>{subtitle || me.email}</ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableRow>
        </Section>

        {/* The user menu's status, and this phone's notifications. */}
        <Section>
          <TapMenu actions={dnd.actions} accessibilityLabel={`${t.dnd}, ${dnd.on ? dnd.label : t.off}`}>
            <LinkRow icon={MoonIcon} tone={dnd.on ? "danger" : undefined} title={t.dnd} value={dnd.on ? dnd.label : t.off} isDisabled={dnd.pending} pointerEvents="none" />
          </TapMenu>
          <LinkRow icon={BellIcon} title={t.notifications} value={notifications.granted ? t.on : t.off} onPress={notifications.open} />
        </Section>

        <Section title={t.groups.account}>
          <LinkRow icon={CalendarClockIcon} title={t.tabs.availability} onPress={() => router.push("/profile/availability")} />
          <LinkRow
            icon={ShieldCheckIcon}
            title={t.tabs.security}
            value={me.twoFactorEnabled ? twoFactorMessages.on : twoFactorMessages.off}
            onPress={() => router.push("/profile/security" as Href)}
          />
          <LinkRow icon={PaletteIcon} title={t.tabs.appearance} value={t.themes[theme]} onPress={() => router.push("/profile/appearance")} />
          <LinkRow icon={ChartIcon} title={t.tabs.usage} onPress={() => router.push("/profile/usage")} />
        </Section>

        {/* The workspace menu: switch organization, its recap; the marketplace for admins. */}
        <Section>
          <LinkRow icon={BuildingIcon} title={t.organizations} value={server.orgName} onPress={() => router.push("/profile/organizations")} />
          {digest ? <LinkRow icon={FileTextIcon} title={t.digest} badge={unread(!digest.seen)} onPress={() => router.push("/digest")} /> : null}
          {admin && <LinkRow icon={PackageIcon} title={t.marketplace} onPress={() => router.push("/profile/marketplace" as Href)} />}
        </Section>

        {admin &&
          adminGroups.map((g) => (
            <Section key={g.title} title={g.title}>
              {g.tabs.map((x) => (
                <Link key={x.href} href={x.href as Href} asChild>
                  <LinkRow icon={x.icon} title={x.title} />
                </Link>
              ))}
            </Section>
          ))}

        {/* Phones signed in to this account (this one included), each can be signed out. */}
        <ConnectedPhones />

        <Section title={t.about}>
          <LinkRow
            icon={SparklesIcon}
            title={t.whatsNew}
            badge={unread(!!latestRelease && me.releaseNotesSeen !== undefined && me.releaseNotesSeen !== latestRelease.version)}
            onPress={() => router.push("/whats-new")}
          />
          <SettingsRow label={t.appVersion} value={appVersion || "—"} />
          <SettingsRow label={t.serverVersion} value={versions?.app ?? "—"} />
          <SettingsRow label={t.engineVersion} value={versions?.hermes ?? "—"} />
        </Section>
      </SettingsScroll>
    </>
  );
}

/**
 * Whether this phone gets notifications. The first tap asks; afterwards the choice lives in
 * iOS Settings, which the row opens (re-read when the screen comes back).
 */
function useNotificationStatus() {
  const [status, setStatus] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      notificationStatus().then(setStatus);
    }, []),
  );
  const open = async () => {
    if (status === "undetermined") {
      await syncPushToken(true);
      const next = await notificationStatus();
      setStatus(next);
      // The system prompt did not show (already answered once): its choice lives in Settings.
      if (next === "undetermined") Linking.openSettings();
    } else Linking.openSettings();
  };
  return { granted: status === "granted", open };
}
