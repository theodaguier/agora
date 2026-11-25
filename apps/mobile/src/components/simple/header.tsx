import { simple } from "@agora/core/i18n";
import { router, Stack } from "expo-router";
import { Typography } from "heroui-native";
import { View } from "react-native";
import { headerIcon, useHeaderTitleWidth } from "@/components/header-button";
import { ChevronDownIcon } from "@/components/icons";
import { TapMenu } from "@/components/menus";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { useAssistants, useNewChat } from "@/lib/simple";
import { useUnreadChats } from "@/components/simple/unread";

/*
 * Figma « Mode simple », the chat's header: the menu (history) on the left, the assistant's name in the
 * middle (a tap lists every assistant opened to them, in the native menu), "New chat" on the right.
 */
export function SimpleChatHeader({
  agentId,
  botName,
  title,
  onBehalfOf,
  conversationId,
}: {
  agentId: string | null;
  botName: string | null;
  title: string;
  /** A colleague's assistant writing for them: its name, then « pour Théo Daguier » under it. */
  onBehalfOf: string | null;
  conversationId: string;
}) {
  const t = tr(simple);
  const agents = useAssistants().data ?? [];
  const newChat = useNewChat();
  // A colleague's assistant writing for them, or a colleague: their conversation's own title, and "New chat" goes to the first assistant.
  const current = agents.find((a) => a.id === agentId);
  const next = current?.id ?? agents[0]?.id ?? null;
  const width = useHeaderTitleWidth(1);
  // What came in the other chats: counted on the menu button (Figma « Ouverture normale »).
  const unread = useUnreadChats(conversationId).length;
  const name = onBehalfOf ? (
    <View style={{ maxWidth: width }} className="items-center">
      <Typography weight="semibold" numberOfLines={1}>
        {botName ?? title}
      </Typography>
      <Typography type="body-xs" color="muted" numberOfLines={1}>
        {t.forPerson(onBehalfOf)}
      </Typography>
    </View>
  ) : (
    <View style={{ maxWidth: width }} className="flex-row items-center gap-1 px-2 py-1">
      <Typography weight="semibold" numberOfLines={1}>
        {current?.name ?? title}
      </Typography>
      {!!current && agents.length > 1 && <ChevronDownIcon size={16} className="text-muted" />}
    </View>
  );
  return (
    <>
      <Stack.Screen
        options={{
          title: current?.name ?? title,
          headerTransparent: true,
          headerBlurEffect: "systemChromeMaterial",
          // As the full conversation's header: the flipped thread must not get iOS 26's edge effect.
          scrollEdgeEffects: { top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" },
          headerTitle: () =>
            current && agents.length > 1 ? (
              <TapMenu
                accessibilityLabel={t.chooseAssistant}
                actions={agents.map((a) => ({
                  label: a.name,
                  description: a.role ?? undefined,
                  checked: a.id === agentId,
                  // Another assistant: a new chat with it (the current one stays in the history).
                  onPress: () => a.id !== agentId && newChat.mutate(a.id),
                }))}
              >
                {name}
              </TapMenu>
            ) : (
              name
            ),
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.panelLeft} iconRenderingMode="template" accessibilityLabel={unread ? `${t.menu}, ${t.newMessages(unread)}` : t.menu} onPress={withTap(() => router.push("/history"))}>
          {unread > 0 && <Stack.Toolbar.Badge>{String(unread)}</Stack.Toolbar.Badge>}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {!!next && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.newChat} onPress={withTap(() => newChat.mutate(next))} />
        </Stack.Toolbar>
      )}
    </>
  );
}
