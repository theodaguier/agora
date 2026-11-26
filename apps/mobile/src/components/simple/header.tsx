import { simple } from "@agora/core/i18n";
import { AppHeader, HeaderCircle, HeaderTitle as AppHeaderTitle } from "@/components/app-header";
import { ComposeIcon } from "@/components/icons";
import { TapMenu } from "@/components/menus";
import { tr } from "@/lib/i18n";
import { useAssistants, useNewChat } from "@/lib/simple";

/*
 * Figma « Mode simple » in the « ChatGPT 1:1 » header (components/app-header.tsx): the menu (history) on the
 * left, the assistant's name in the middle (a tap lists every assistant opened to them, in the native
 * menu), "New chat" on the right.
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
  const many = !!current && agents.length > 1;
  const name = <AppHeaderTitle title={botName && onBehalfOf ? botName : (current?.name ?? title)} subtitle={onBehalfOf ? t.forPerson(onBehalfOf) : null} chevron={many} />;
  return (
    <AppHeader
      current={conversationId}
      title={
        many ? (
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
        )
      }
      right={!!next && <HeaderCircle icon={ComposeIcon} label={t.newChat} onPress={() => newChat.mutate(next)} />}
    />
  );
}
