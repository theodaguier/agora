import { connectorName } from "@agora/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { PressableFeedback, Separator, Spinner, Surface, Typography } from "heroui-native";
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { BrandLogo } from "@/components/brand-logo";
import { brandsQuery, toolServer } from "@/components/brand-logos";
import { CheckIcon } from "@/components/icons";
import { MessageText } from "@/components/message-text";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Mentionable } from "@/lib/mentions";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/Bubbles.tsx and the thread's parts of screens/Conversation.tsx (Figma
 * « Conversation · Dev »): what others write is flat in their column, under their name; only your
 * messages are bubbles, grey on the right (the bot's colour stays out of them).
 */

const messages = defineMessages({
  en: {
    using: "Using",
    used: "Used",
    tools: {
      terminal: "Terminal", execute_code: "Code", read_file: "File read", write_file: "File edit", patch: "File edit",
      search_files: "File search", web_search: "Web search", web_extract: "Web page", web_fetch: "Web page", browser: "Browser",
      vision_analyze: "Image analysis", image_generate: "Image generation", text_to_speech: "Voice", memory: "Memory",
      session_search: "History", todo: "Tasks", clarify: "Question", delegate_task: "Sub-agent", cronjob: "Routine",
      send_message: "Message", mixture_of_agents: "Several models", skill: "Skill", thinking: "Thinking",
    } as Record<string, string>,
    typing: (names: string, n: number) => `${names} ${n > 1 ? "are" : "is"} typing…`,
    denied: (n: number) => `${n} command${n > 1 ? "s" : ""} denied`,
  },
  fr: {
    using: "Utilise",
    used: "A utilisé",
    tools: {
      terminal: "Terminal", execute_code: "Code", read_file: "Lecture de fichier", write_file: "Modification de fichier", patch: "Modification de fichier",
      search_files: "Recherche de fichiers", web_search: "Recherche web", web_extract: "Lecture de page", web_fetch: "Lecture de page", browser: "Navigateur",
      vision_analyze: "Analyse d'image", image_generate: "Génération d'image", text_to_speech: "Voix", memory: "Mémoire",
      session_search: "Historique", todo: "Tâches", clarify: "Question", delegate_task: "Sous-agent", cronjob: "Routine",
      send_message: "Message", mixture_of_agents: "Plusieurs modèles", skill: "Compétence", thinking: "Réflexion",
    } as Record<string, string>,
    typing: (names: string, n: number) => `${names} ${n > 1 ? "écrivent" : "écrit"}…`,
    denied: (n: number) => `${n} commande${n > 1 ? "s" : ""} refusée${n > 1 ? "s" : ""}`,
  },
});

/** Who opens a run of messages: their face, their name, the time. */
export type PostHead = { avatar: ReactNode; name: string; time: string };

/**
 * A message from a bot or a colleague, flat (web: Post). The first of a run opens on its author
 * (20 pt face, name, time); its parts run under it, 28 pt in, 12 pt apart.
 */
export function Post({ head, className, children }: { head?: PostHead; className?: string; children: ReactNode }) {
  return (
    <View className={cn("min-w-0 gap-2.5", className)}>
      {head && (
        <View className="flex-row items-center gap-2">
          {head.avatar}
          <Typography type="body-sm" weight="medium" numberOfLines={1} className="shrink">
            {head.name}
          </Typography>
          <Typography type="body-xs" className="text-subtle tabular-nums">
            {head.time}
          </Typography>
        </View>
      )}
      <View className="min-w-0 gap-3 pl-7">{children}</View>
    </View>
  );
}

/** A message's text, flat in its author's column: no bubble around what others write. */
export function FlatText({ text, streaming, plain, mentionables }: { text: string; streaming?: boolean; plain?: boolean; mentionables?: Mentionable[] }) {
  return <MessageText text={text} streaming={streaming} plain={plain} mentionables={mentionables} className="min-w-0" />;
}

/** A bubble of yours (HeroUI's `secondary` surface, the web's grey), the frame of your text, quote and files. */
export function Bubble({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Surface variant="secondary" className={cn("min-w-0 self-end rounded-2xl", className)}>
      {children}
    </Surface>
  );
}

/** Your message: a grey bubble on the right, the conversation's colours aside. */
export function UserBubble({ text, mentionables, className }: { text: string; mentionables?: Mentionable[]; className?: string }) {
  return (
    <Bubble className={cn("px-3.5 py-2", className)}>
      <MessageText plain text={text} mentionables={mentionables} className="min-w-0" />
    </Bubble>
  );
}

/** One dot of the typing indicator (6 pt, muted, as on the web), each one 150 ms after the previous. */
function BounceDot({ delay }: { delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withDelay(delay, withRepeat(withSequence(withTiming(-3, { duration: 300 }), withTiming(0, { duration: 300 })), -1)));
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={style}>
      <View className="size-1.5 rounded-full bg-muted" />
    </Animated.View>
  );
}

/** A bot writing its reply: three dots in its column, no bubble. */
export function TypingBubble({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} className="h-5 flex-row items-center gap-1 self-start">
      {[0, 1, 2].map((d) => (
        <BounceDot key={d} delay={d * 150} />
      ))}
    </View>
  );
}

/** Colleagues writing, on one quiet line under the thread (the bots say it in their own column). */
export function TypingLine({ entries }: { entries: { key: string; name: string }[] }) {
  const t = messages;
  if (!entries.length) return null;
  return (
    <Typography accessibilityLiveRegion="polite" type="body-xs" color="muted" className="mt-2">
      {t.typing(entries.map((e) => e.name).join(", "), entries.length)}
    </Typography>
  );
}

/** A tool in words: a connector by its name and logo, the others by what they do (never `web_search`). */
function useToolWords() {
  const t = messages;
  const { data: brands } = useQuery(brandsQuery);
  const servers = Object.keys(brands?.servers ?? {});
  return (name: string): { key: string; label: string; server: string | null } => {
    const server = toolServer(name, servers);
    if (server) return { key: `mcp:${server}`, label: connectorName(server), server };
    const id = name.toLowerCase();
    const known = id.startsWith("browser_") ? "browser" : id.startsWith("skill") ? "skill" : id === "process" || id === "bash" ? "terminal" : id;
    const label = t.tools[known] ?? id.replace(/^mcp_+/, "").replace(/_+/g, " ").replace(/^./, (c) => c.toUpperCase());
    return { key: label, label, server: null };
  };
}

/**
 * Tools used by the agent during a reply (hermes.tool.progress events): one quiet line, « A utilisé
 * Recherche web, Lecture de page », a connector with its logo. Code sessions are told by their card.
 * The commands it was allowed to run are that same Terminal, not a second line (web: ToolLine): only
 * a denial is said out loud.
 */
export function ToolLine({
  tools,
  approvals = [],
  running,
}: {
  tools: { name: string; status: string }[];
  approvals?: { command: string; choice: string }[];
  running?: boolean;
}) {
  const t = messages;
  const words = useToolWords();
  const seen = new Map<string, ReturnType<typeof words>>();
  const terminal = words("terminal");
  const denied = approvals.filter((a) => a.choice === "deny").length;
  for (const tool of [...tools, ...(approvals.length ? [{ name: "terminal", status: "" }] : [])]) {
    // Its reasoning isn't a tool it used.
    if (tool.name.startsWith("claude_code_") || tool.name === "code_session" || /^(thinking|réflexion)$/i.test(tool.name)) continue;
    const w = words(tool.name);
    if (!seen.has(w.key)) seen.set(w.key, w);
  }
  if (!seen.size) return null;
  const list = [...seen.values()];
  return (
    <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
      {running ? <Spinner size="sm" /> : <CheckIcon size={12} className="text-subtle" />}
      <Typography type="body-xs" className="text-subtle">
        {running ? t.using : t.used}
      </Typography>
      {list.map((w, i) => (
        <View key={w.key} className="flex-row items-center gap-1">
          {w.server && <BrandLogo server={w.server} fallback={null} className="size-3 rounded-[3px]" />}
          <Typography type="body-xs" color="muted">
            {w.label}
            {w.key === terminal.key && denied > 0 && ` (${t.denied(denied)})`}
            {i < list.length - 1 && ","}
          </Typography>
        </View>
      ))}
    </View>
  );
}

/** The day between two hairlines, once per day; the times are on the messages. */
export function DayDivider({ label }: { label: string }) {
  return (
    <View className="my-1 flex-row items-center gap-3">
      <Separator className="flex-1" />
      <Typography type="body-xs" className="text-subtle">
        {label}
      </Typography>
      <Separator className="flex-1" />
    </View>
  );
}

/**
 * What happened in the conversation (joined, renamed…): in the thread's flow on the left, in grey, no
 * centred banner. `conversationId`: the event points at another conversation (a relay), which it opens.
 */
export function ThreadEvent({ label, conversationId, className }: { label: string; conversationId?: string; className?: string }) {
  const text = (
    <Typography type="body-xs" className={cn("text-subtle", conversationId && "underline")}>
      {label}
    </Typography>
  );
  if (!conversationId) return <View className={cn("mt-3 pl-7", className)}>{text}</View>;
  return (
    <PressableFeedback
      accessibilityRole="link"
      onPress={withTap(() => router.push({ pathname: "/c/[conversationId]", params: { conversationId } }))}
      className={cn("mt-3 self-start pl-7", className)}
    >
      {text}
    </PressableFeedback>
  );
}
