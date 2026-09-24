import { auth } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
import { router, Stack, useFocusEffect, type Href } from "expo-router";
import { ListGroup } from "heroui-native";
import { useCallback, useState } from "react";
import { Linking, ScrollView } from "react-native";
import { PersonAvatar } from "@/components/conversation-avatar";
import {
  BellIcon,
  BuildingIcon,
  ChartIcon,
  ClockIcon,
  FileTextIcon,
  MoonIcon,
  PackageIcon,
  PaletteIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@/components/icons";
import { useDnd } from "@/components/profile/dnd";
import { useMeProfile } from "@/components/profile/me";
import { useSignOut } from "@/components/profile/organizations";
import { organizationsMessages } from "@/components/profile/organizations-messages";
import { LinkRow, PressableRow, Section } from "@/components/profile/settings";
import { ConnectedPhones } from "@/components/admin/connected-phones";
import { useTheme } from "@/components/profile/theme";
import { useServer } from "@/components/server-scope";
import { digestQuery } from "@/lib/digest";
import { serverVersionQuery } from "@/lib/queries";
import { defineMessages, tr } from "@/lib/i18n";
import { latestRelease } from "@/lib/whats-new";
import { notificationStatus, syncPushToken } from "@/lib/notifications";
import { TapMenu } from "@/components/menus";
import { twoFactorMessages } from "@/components/two-factor";

const messages = defineMessages({
  en: {
    title: "Profile",
    dnd: "Do not disturb",
    off: "Off",
    notifications: "Notifications",
    on: "On",
    availability: "Availability",
    availabilityHelp: "Working hours and absences",
    appearance: "Appearance",
    security: "Security",
    themes: { system: "System", light: "Light", dark: "Dark" },
    usage: "Usage",
    digest: "Morning recap",
    unread: "New",
    whatsNew: "What's new",
    admin: "Admin",
    administration: "Administration",
    marketplace: "Marketplace",
    organizations: "Organizations",
    member: "Member",
    about: "About",
    appVersion: "App",
    serverVersion: "Server",
    engineVersion: "Hermes engine",
  },
  fr: {
    title: "Profil",
    dnd: "Ne pas déranger",
    off: "Désactivé",
    notifications: "Notifications",
    on: "Activées",
    availability: "Disponibilité",
    availabilityHelp: "Horaires de travail et absences",
    appearance: "Apparence",
    security: "Sécurité",
    themes: { system: "Système", light: "Clair", dark: "Sombre" },
    usage: "Consommation",
    digest: "Récap du matin",
    unread: "Nouveau",
    whatsNew: "Nouveautés",
    admin: "Admin",
    administration: "Administration",
    marketplace: "Marketplace",
    organizations: "Organisations",
    member: "Membre",
    about: "À propos",
    appVersion: "Application",
    serverVersion: "Serveur",
    engineVersion: "Moteur Hermes",
  },
});

/** The signed-in person's space: their profile, status, preferences, organizations; the web's user menu and personal Settings tabs. */
export default function Profile() {
  const t = { ...messages, signOut: tr(auth).signOut, orgs: organizationsMessages };
  const me = useMeProfile();
  const server = useServer();
  const dnd = useDnd(me.id);
  const theme = useTheme();
  const { data: digest } = useQuery(digestQuery);
  const { data: versions } = useQuery(serverVersionQuery);
  const appVersion = [Application.nativeApplicationVersion, Application.nativeBuildVersion && `(${Application.nativeBuildVersion})`].filter(Boolean).join(" ");
  const signOut = useSignOut();
  const admin = me.role === "admin";
  const notifications = useNotificationStatus();
  const subtitle = [me.title, admin ? t.admin : null].filter(Boolean).join(" · ");

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-8 px-4 pb-12 pt-2">
        <ListGroup>
          <PressableRow onPress={() => router.push("/profile/edit")} accessibilityLabel={[me.name, subtitle, me.email].filter(Boolean).join(", ")}>
            <ListGroup.Item>
              <ListGroup.ItemPrefix>
                <PersonAvatar person={{ id: me.id, name: me.name, image: me.image }} size={64} />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{me.name}</ListGroup.ItemTitle>
                {!!subtitle && <ListGroup.ItemDescription numberOfLines={1}>{subtitle}</ListGroup.ItemDescription>}
                <ListGroup.ItemDescription numberOfLines={1}>{me.email}</ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix />
            </ListGroup.Item>
          </PressableRow>
        </ListGroup>

        <Section inset="icon">
          <TapMenu actions={dnd.actions} accessibilityLabel={`${t.dnd}, ${dnd.on ? dnd.label : t.off}`}>
            <LinkRow icon={MoonIcon} tone={dnd.on ? "danger" : "default"} title={t.dnd} value={dnd.on ? dnd.label : t.off} disabled={dnd.pending} />
          </TapMenu>
          <LinkRow icon={BellIcon} tone="danger" title={t.notifications} value={notifications.granted ? t.on : t.off} onPress={notifications.open} />
          <LinkRow icon={ClockIcon} tone="success" title={t.availability} description={t.availabilityHelp} onPress={() => router.push("/profile/availability")} />
        </Section>

        <Section inset="icon">
          <LinkRow icon={PaletteIcon} title={t.appearance} value={t.themes[theme]} onPress={() => router.push("/profile/appearance")} />
          <LinkRow
            icon={ShieldCheckIcon}
            tone="success"
            title={t.security}
            value={me.twoFactorEnabled ? twoFactorMessages.on : twoFactorMessages.off}
            onPress={() => router.push("/profile/security" as Href)}
          />
          <LinkRow icon={ChartIcon} tone="warning" title={t.usage} onPress={() => router.push("/profile/usage")} />
          {digest ? (
            <LinkRow icon={FileTextIcon} tone="default" title={t.digest} badge={digest.seen ? null : t.unread} onPress={() => router.push("/digest")} />
          ) : null}
          <LinkRow
            icon={SparklesIcon}
            tone="default"
            title={t.whatsNew}
            badge={latestRelease && me.releaseNotesSeen !== undefined && me.releaseNotesSeen !== latestRelease.version ? t.unread : null}
            onPress={() => router.push("/whats-new")}
          />
        </Section>

        {admin && (
          <Section inset="icon">
            <LinkRow icon={SettingsIcon} tone="default" title={t.administration} onPress={() => router.push("/profile/admin" as Href)} />
            <LinkRow icon={PackageIcon} title={t.marketplace} onPress={() => router.push("/profile/marketplace" as Href)} />
          </Section>
        )}

        <Section inset="icon">
          <LinkRow icon={BuildingIcon} tone="default" title={t.organizations} value={server.orgName} onPress={() => router.push("/profile/organizations")} />
        </Section>

        {/* Phones signed in to this account (this one included), each can be signed out. */}
        <ConnectedPhones />

        <Section header={t.about}>
          <LinkRow title={t.appVersion} value={appVersion || "—"} chevron={false} />
          <LinkRow title={t.serverVersion} value={versions?.app ?? "—"} chevron={false} />
          <LinkRow title={t.engineVersion} value={versions?.hermes ?? "—"} chevron={false} />
        </Section>

        <Section footer={server.url.replace(/^https?:\/\//, "")}>
          <LinkRow title={t.signOut} destructive chevron={false} onPress={() => signOut(server)} />
        </Section>
      </ScrollView>
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
