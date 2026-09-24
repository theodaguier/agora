import { auth, common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Chip, ListGroup } from "heroui-native";
import { View } from "react-native";
import { confirmAction } from "@/components/confirm-action";
import { OrgLogo } from "@/components/org-logo";
import { LinkRow, Section } from "@/components/profile/settings";
import { apiOn } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { useServers, type Server } from "@/lib/servers";
import { TapMenu, type MenuEntry } from "@/components/menus";
import { organizationsMessages } from "@/components/profile/organizations-messages";

/** Closes this phone's session on the server, and forgets it locally even if the server is unreachable. */
export function useSignOut() {
  const { remove } = useServers();
  return async (server: Server) => {
    const t = { ...organizationsMessages, signOut: tr(auth).signOut };
    if (!(await confirmAction({ title: t.signOutTitle(server.orgName), description: t.signOutHelp, action: t.signOut }))) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await apiOn(server, "/mobile/sign-out", { method: "POST" }).catch(() => {});
    await remove(server.url);
  };
}

/** The organizations this phone is signed in to: switch, sign out, add one. */
export function Organizations() {
  const t = { ...organizationsMessages, signOut: tr(auth).signOut, cancel: tr(common).cancel };
  const { servers, current, select } = useServers();
  const signOut = useSignOut();

  // The HeroUI Menu of an organization's row: switch to it, sign out.
  const actions = (s: Server): MenuEntry[] => [
    ...(s.url === current?.url
      ? []
      : [
          {
            label: t.switchTo(s.orgName),
            icon: "arrow.left.arrow.right" as const,
            onPress: async () => {
              Haptics.selectionAsync();
              await select(s.url);
            },
          },
        ]),
    { label: t.signOut, icon: "rectangle.portrait.and.arrow.right", destructive: true, onPress: () => signOut(s) },
  ];

  return (
    <View className="gap-8">
      <Section footer={t.help} inset="icon">
        {servers.map((s) => (
          <TapMenu
            key={s.url}
            actions={[{ title: `${s.user.email} · ${host(s.url)}`, actions: actions(s) }]}
            accessibilityLabel={[s.orgName, s.user.email, s.url === current?.url ? t.current : null].filter(Boolean).join(", ")}
          >
            {/* The TapMenu's PressableFeedback takes the touch: the row itself takes none. */}
            <ListGroup.Item pointerEvents="none">
              <ListGroup.ItemPrefix>
                <OrgLogo server={s.url} image={s.orgImage} className="size-9" />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{s.orgName}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription numberOfLines={1}>
                  {s.user.email} · {host(s.url)}
                </ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              {s.url === current?.url && (
                <ListGroup.ItemSuffix>
                  <Chip size="sm" variant="soft" color="accent">
                    {t.current}
                  </Chip>
                </ListGroup.ItemSuffix>
              )}
            </ListGroup.Item>
          </TapMenu>
        ))}
      </Section>
      <Section>
        <LinkRow title={t.add} action chevron={false} onPress={() => router.push("/server")} />
      </Section>
    </View>
  );
}

const host = (url: string) => url.replace(/^https?:\/\//, "");
