import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Chip, PressableFeedback, Surface, Typography, useToast } from "heroui-native";
import { useEffect, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { BubbleAttachments, SentAttachments } from "@/components/attachments";
import { attachmentSource, Image, isImage, saveAttachment } from "@/components/attachment-files";
import { Bubble, PeerBubble, UserBubble } from "@/components/bubbles";
import { LongPressMenu } from "@/components/menus";
import { ClockIcon, PackageIcon, PlugIcon, ReplyIcon } from "@/components/icons";
import { MessageText } from "@/components/message-text";
import { defineMessages } from "@/lib/i18n";
import type { Mentionable } from "@/lib/mentions";
import { invocationKey, type Attachment, type Invocation, type ReplyTo } from "@/lib/types";
import { cn } from "@/lib/utils";

/* apps/web/src/components/MessageParts.tsx */

const messages = defineMessages({
  en: {
    actions: "Message actions",
    reply: "Reply",
    forward: "Forward",
    pin: "Pin",
    unpin: "Unpin",
    copy: "Copy text",
    copied: "Text copied",
    download: (n: number) => (n > 1 ? `Download ${n} files` : "Download"),
    forwardedFrom: (name: string) => `Forwarded from ${name}`,
    photo: "Photo",
  },
  fr: {
    actions: "Actions du message",
    reply: "Répondre",
    forward: "Transférer",
    pin: "Épingler",
    unpin: "Désépingler",
    copy: "Copier le texte",
    copied: "Texte copié",
    download: (n: number) => (n > 1 ? `Télécharger les ${n} fichiers` : "Télécharger"),
    forwardedFrom: (name: string) => `Transféré de ${name}`,
    photo: "Photo",
  },
});

/**
 * The message being answered: in the bubble that answers it, and above the composer.
 * `onAccent`: drawn inside one of your bubbles (the `tertiary` surface), so on the `secondary` one.
 */
export function QuoteBlock({
  quote,
  onPress,
  actions,
  className,
  onAccent,
}: {
  quote: ReplyTo;
  onPress?: () => void;
  actions?: ReactNode;
  className?: string;
  onAccent?: boolean;
}) {
  const t = messages;
  const image = quote.attachment && isImage(quote.attachment.mime) ? quote.attachment : null;
  const label = quote.text || (image ? t.photo : (quote.attachment?.name ?? ""));
  return (
    <PressableFeedback onPress={onPress} isDisabled={!onPress} className={cn("w-full self-stretch", className)}>
      <Surface variant={onAccent ? "secondary" : "tertiary"} className="w-full flex-row items-center gap-2.5 px-3 py-2">
        <PressableFeedback.Highlight />
        <View className="min-w-0 flex-1">
          <Typography weight="medium" numberOfLines={1}>
            {quote.authorName}
          </Typography>
          <Typography type="body-sm" color="muted" numberOfLines={1}>
            {label}
          </Typography>
        </View>
        {image && (
          <Surface variant="transparent" className="size-9 p-0">
            <Image source={attachmentSource(image)} cachePolicy="disk" contentFit="cover" className="size-9" />
          </Surface>
        )}
        {actions}
      </Surface>
    </PressableFeedback>
  );
}

/**
 * An employee's message: text, files, reply and forward context in one bubble.
 * Files sent without text stay bare.
 */
export function ChatMessage(props: {
  mine: boolean;
  text: string;
  attachments?: (Attachment & { previewUri?: string })[];
  invocations?: Invocation[];
  replyTo?: ReplyTo;
  forwarded?: { authorName: string };
  mentionables: Mentionable[];
  onQuote?: (id: string) => void;
}) {
  const { mine, text, attachments = [], invocations = [], replyTo, forwarded, mentionables, onQuote } = props;
  const t = messages;
  const framed = !!(text || replyTo || forwarded);
  const rich = !!(attachments.length || replyTo || forwarded);
  return (
    <View className={cn("min-w-0 flex-col gap-1", mine ? "items-end" : "items-start")}>
      {invocations.length > 0 && (
        <View className="flex-row flex-wrap justify-end gap-1.5">
          {invocations.map((v) => {
            const Icon = v.kind === "skill" ? PackageIcon : v.kind === "routine" ? ClockIcon : PlugIcon;
            return (
              <Chip key={invocationKey(v)} size="sm" variant="secondary" color="default">
                <Icon className="size-3.5 text-muted" />
                <Chip.Label>{v.name}</Chip.Label>
              </Chip>
            );
          })}
        </View>
      )}
      {!framed && attachments.length > 0 && <SentAttachments items={attachments} align={mine ? "end" : "start"} />}
      {framed && !rich && (mine ? <UserBubble text={text} mentionables={mentionables} /> : <PeerBubble text={text} mentionables={mentionables} />)}
      {framed && rich && (
        <Bubble
          mine={mine}
          className={cn("max-w-full flex-col gap-1 p-1", attachments.some((a) => isImage(a.mime)) ? "w-64" : "max-w-80", replyTo && "min-w-52")}
 >
          {forwarded && (
            <Typography type="body-sm" color="muted" className="px-2.5 pt-1">
              {t.forwardedFrom(forwarded.authorName)}
            </Typography>
          )}
          {replyTo && <QuoteBlock quote={replyTo} onAccent={mine} onPress={onQuote && (() => onQuote(replyTo.id))} />}
          {attachments.length > 0 && <BubbleAttachments items={attachments} />}
          {!!text && <MessageText plain text={text} mentionables={mentionables} className="min-w-0 px-2.5 pt-0.5 pb-1.5" />}
        </Bubble>
      )}
    </View>
  );
}

/** Downloads each file in turn, one share sheet after the other. */
async function downloadAll(files: Attachment[]) {
  for (const f of files) await saveAttachment(f);
}

/** Flash behind a message brought into view (a quote tapped, a search result). */
function Highlight({ on }: { on?: boolean }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.set(withTiming(on ? 1 : 0, { duration: on ? 150 : 700 }));
  }, [on, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={style} className="absolute -inset-x-4 inset-y-0">
      <Surface variant="secondary" className="flex-1 p-0" />
    </Animated.View>
  );
}

/** How far a message is pulled to the right before letting go replies to it. */
const REPLY_AT = 56;
/** Distance the finger travels before the swipe starts: the bubble starts from there, it doesn't jump. */
const SWIPE_FROM = 16;
/** Share of the finger's travel the bubble follows, up to REPLY_AT. */
const DRAG = 0.6;
/** Past REPLY_AT, the bubble resists more and more, up to this many extra points (iOS rubber band). */
const STRETCH = 24;

/** Where the bubble is for a finger `d` points past the start of the swipe. */
function pulled(d: number) {
  "worklet";
  const x = Math.max(0, d) * DRAG;
  if (x <= REPLY_AT) return x;
  const over = x - REPLY_AT;
  return REPLY_AT + (1 - 1 / ((over * 0.55) / STRETCH + 1)) * STRETCH;
}

/**
 * A message line: its bubble, with its actions in the iOS context menu (long press: reply, forward,
 * pin, copy, download) and a swipe to the right to reply, as in Messages.
 */
export function MessageRow(props: {
  id: string;
  mine?: boolean;
  wide?: boolean;
  highlighted?: boolean;
  text?: string;
  attachments?: Attachment[];
  onReply: () => void;
  onForward: () => void;
  /** The message itself is pinned (the menu then offers to unpin it). */
  pinned?: boolean;
  onTogglePin?: () => void;
  children: ReactNode;
}) {
  const t = messages;
  const { toast } = useToast();
  const files = props.attachments ?? [];
  const { width } = useWindowDimensions();
  // 80% of the screen (88% for a bot's answer), less the thread's margins.
  const maxWidth = Math.round((width - 32) * (props.wide ? 0.88 : 0.8));

  const x = useSharedValue(0);
  const armed = useSharedValue(false);
  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  // Taken out of `props` first: a worklet reading `props.onReply` would capture all the props (children included).
  const reply = props.onReply;
  const swipe = Gesture.Pan()
    .activeOffsetX(SWIPE_FROM)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      x.value = pulled(e.translationX - SWIPE_FROM);
      if (!armed.value && x.value >= REPLY_AT) {
        armed.value = true;
        scheduleOnRN(tick);
      } else if (armed.value && x.value < REPLY_AT) armed.value = false;
    })
    .onEnd((e) => {
      if (armed.value) scheduleOnRN(reply);
      armed.value = false;
      // Critically damped, from the finger's speed: the bubble glides back without swinging past its place.
      x.value = withSpring(0, { duration: 300, dampingRatio: 1, velocity: e.velocityX * DRAG, overshootClamping: true });
    });
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const hint = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [16, REPLY_AT], [0, 1], "clamp"), transform: [{ scale: interpolate(x.value, [16, REPLY_AT], [0.6, 1], "clamp") }] }));

  return (
    <View accessibilityHint={t.actions} className={cn("relative flex-row", props.mine ? "justify-end" : "justify-start")}>
      <Highlight on={props.highlighted} />
      <Animated.View pointerEvents="none" style={hint} className="absolute top-0 bottom-0 -left-1 justify-center">
        <Surface variant="secondary" className="size-8 items-center justify-center p-0">
          <ReplyIcon className="size-4 text-muted" />
        </Surface>
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={moving}>
          <LongPressMenu
            actions={[
              { label: t.reply, icon: "arrowshape.turn.up.left", onPress: props.onReply },
              { label: t.forward, icon: "arrowshape.turn.up.right", onPress: props.onForward },
              props.onTogglePin && { label: props.pinned ? t.unpin : t.pin, icon: props.pinned ? "pin.slash" : "pin", onPress: props.onTogglePin },
              (!!props.text || files.length > 0) && "divider",
              !!props.text && {
                label: t.copy,
                icon: "doc.on.doc",
                onPress: () =>
                  Clipboard.setStringAsync(props.text!).then(() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    toast.show({ variant: "success", label: t.copied });
                  }),
              },
              files.length > 0 && { label: t.download(files.length), icon: "square.and.arrow.down", onPress: () => downloadAll(files) },
            ]}
 >
            <View style={{ maxWidth }} className={cn("min-w-0", props.mine ? "items-end" : "items-start")}>
              {props.children}
            </View>
          </LongPressMenu>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
