import { plainPreview, renderEvent } from "@agora/core";
import { Link, type Href } from "expo-router";
import { ListGroup, Spinner, Typography } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { ColorDot, ConversationAvatar } from "@/components/conversation-avatar";
import { PressableItem } from "@/components/people/section";
import { listTime } from "@/lib/dates";
import { locale } from "@/lib/i18n";
import { useTurns } from "@/lib/realtime";
import type { ConversationSummary } from "@/lib/types";

/** A conversation in a list: its avatar, name and time, then its last message, or what its bot is doing. */
export function ConversationRow({
  item: c,
  me,
  t,
  href,
  menu,
}: {
  item: ConversationSummary & { name: string };
  me: string;
  t: { prefix: (name: string) => string; you: string; unread: string; waiting: string; working: string };
  /** Where a tap goes: the conversation's thread by default (a project opens its discussions). */
  href?: Href;
  /** Its long-press menu (Link.Menu), in place of the preview alone. */
  menu?: ReactNode;
}) {
  // A bot waiting for an approval: said instead of the last message, with the orange dot (état/attente).
  const turns = useTurns(c.id);
  const waiting = turns.some((x) => x.approval);
  const working = !waiting && turns.length > 0;
  const preview = c.preview;
  const prefix = preview ? (preview.fromMe ? t.prefix(t.you) : preview.author && c.kind === "group" ? t.prefix(preview.author) : "") : "";
  // « Pixel est prêt » under Pixel's name says nothing: a list preview is a message, not a setup event.
  const shown = preview && preview.event?.type !== "agent.ready" ? preview : null;
  const text = shown ? plainPreview(shown.event ? renderEvent(shown.event, locale) : shown.text) : "";
  return (
    <Link href={href ?? { pathname: "/c/[conversationId]", params: { conversationId: c.id } }} asChild>
      <Link.Trigger>
        <PressableItem itemClassName="gap-3 py-2.5">
          <ListGroup.ItemPrefix>
            {/* Presence only for colleagues: what a bot is doing is said on the second line. */}
            <ConversationAvatar conversation={c} me={me} className="size-11" status={!c.agents.length} />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent className="gap-0.5">
            <View className="flex-row items-baseline gap-2">
              <ListGroup.ItemTitle className="flex-1" numberOfLines={1}>
                {c.name}
              </ListGroup.ItemTitle>
              <Typography type="body-xs" className="text-subtle">
                {listTime(new Date(c.lastAt))}
              </Typography>
            </View>
            {/* Figma « Ligne de conversation »: the dot ends the second line, under the time. Waiting for you: orange; unread: blue. */}
            <View className="flex-row items-center gap-2">
              {working && <Spinner size="sm" color="default" />}
              <ListGroup.ItemDescription className="flex-1" numberOfLines={1}>
                {waiting ? t.waiting : working ? t.working : shown ? `${prefix}${text}` : ""}
              </ListGroup.ItemDescription>
              {waiting ? (
                <View accessibilityLabel={t.waiting}>
                  <ColorDot size={8} color="text-waiting" />
                </View>
              ) : (
                c.unread && (
                  <View accessibilityLabel={t.unread}>
                    <ColorDot size={8} color="text-brand" />
                  </View>
                )
              )}
            </View>
          </ListGroup.ItemContent>
        </PressableItem>
      </Link.Trigger>
      <Link.Preview />
      {menu}
    </Link>
  );
}
