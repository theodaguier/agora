import { useQuery } from "@tanstack/react-query";
import { Alert, BottomSheet, ListGroup, Separator, SkeletonGroup, Slider, Typography } from "heroui-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { defineMessages, locale } from "@/lib/i18n";
import { providerName } from "@/lib/admin";
import { contextQuery } from "@/lib/queries";
import { numberFormat } from "@/lib/intl";

/* apps/web/src/components/ContextDialog.tsx, as a bottom sheet. */

const messages = defineMessages({
  en: {
    title: "Context",
    description: "What the bot keeps in mind in this thread.",
    usage: "Context used",
    unknownWindow: "Unknown window size",
    model: "Model",
    messages: "Messages in context",
    compacted: "Compacted: the summary goes with your next message.",
    autoCompressions: (n: number) => `Hermes compressed it on its own ${n === 1 ? "once" : `${n} times`}.`,
    totals: "Tokens used in this session",
    totalsDetail: (input: string, output: string, cache: string) => `${input} in · ${output} out · ${cache} from cache`,
    empty: "Nothing sent to the bot since this context started.",
    outside: (engine: string) => `${engine} keeps its context outside Hermes: no details available.`,
    failed: "Couldn't read the context.",
  },
  fr: {
    title: "Contexte",
    description: "Ce que le bot garde en tête dans ce fil.",
    usage: "Contexte utilisé",
    unknownWindow: "Taille de fenêtre inconnue",
    model: "Modèle",
    messages: "Messages en contexte",
    compacted: "Compacté : le résumé part avec ton prochain message.",
    autoCompressions: (n: number) => `Hermes l'a compressé de lui-même ${n === 1 ? "une fois" : `${n} fois`}.`,
    totals: "Tokens consommés dans cette session",
    totalsDetail: (input: string, output: string, cache: string) => `${input} en entrée · ${output} en sortie · ${cache} depuis le cache`,
    empty: "Rien n'a été envoyé au bot depuis le début de ce contexte.",
    outside: (engine: string) => `${engine} garde son contexte hors de Hermes : pas de détail disponible.`,
    failed: "Impossible de lire le contexte.",
  },
});

/** /context: how full the bot's current session is. */
export function ContextDialog({ conversationId, open, onOpenChange }: { conversationId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = messages;
  const insets = useSafeAreaInsets();
  const { data, isPending, isError } = useQuery({ ...contextQuery(conversationId), enabled: open, refetchOnMount: "always" });
  const number = numberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const session = data?.session;
  const percent = session?.window ? Math.min(100, Math.round((session.tokens / session.window) * 100)) : null;
  const rows = data
    ? [
        ...(data.model ? [{ title: t.model, value: data.model }] : []),
        ...(session
          ? [
              {
                title: t.messages,
                value: `${session.messages}${session.autoCompressions > 0 ? ` · ${t.autoCompressions(session.autoCompressions)}` : ""}`,
              },
              {
                title: t.totals,
                value: t.totalsDetail(number.format(session.totals.input), number.format(session.totals.output), number.format(session.totals.cacheRead)),
              },
            ]
          : []),
      ]
    : [];
  const note = data ? (data.compacted ? t.compacted : !session ? (data.engine !== "hermes" ? t.outside(providerName(data.engine)) : t.empty) : null) : null;

  return (
    <BottomSheet isOpen={open} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content contentContainerClassName="gap-5 px-5" contentContainerProps={{ style: { paddingBottom: insets.bottom + 16 } }}>
          <View className="gap-1">
            <BottomSheet.Title>{t.title}</BottomSheet.Title>
            <BottomSheet.Description>{t.description}</BottomSheet.Description>
          </View>
          {isPending ? (
            <SkeletonGroup isLoading isSkeletonOnly className="gap-3">
              <SkeletonGroup.Item className="h-5 w-2/3" />
              <SkeletonGroup.Item className="h-2 w-full" />
              <SkeletonGroup.Item className="h-24 w-full" />
            </SkeletonGroup>
          ) : isError ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{t.failed}</Alert.Title>
              </Alert.Content>
            </Alert>
          ) : (
            <>
              {session && (
                <View className="gap-2">
                  <View className="flex-row items-baseline justify-between gap-3">
                    <Typography weight="semibold">{t.usage}</Typography>
                    <Typography type="body-sm" color="muted" className="tabular-nums">
                      {session.window ? `≈ ${number.format(session.tokens)} / ${number.format(session.window)}` : `≈ ${number.format(session.tokens)} · ${t.unknownWindow}`}
                    </Typography>
                  </View>
                  {percent !== null && (
                    // A read-only slider as the gauge: no thumb, no touch.
                    <Slider value={percent} minValue={0} maxValue={100} pointerEvents="none" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
                      <Slider.Track>
                        <Slider.Fill />
                      </Slider.Track>
                    </Slider>
                  )}
                </View>
              )}
              {rows.length > 0 && (
                <ListGroup variant="secondary">
                  {rows.map((r, i) => (
                    <View key={r.title}>
                      {i > 0 && <Separator className="mx-4" />}
                      <ListGroup.Item disabled>
                        <ListGroup.ItemContent className="gap-0.5">
                          <ListGroup.ItemTitle>{r.title}</ListGroup.ItemTitle>
                          <ListGroup.ItemDescription>{r.value}</ListGroup.ItemDescription>
                        </ListGroup.ItemContent>
                      </ListGroup.Item>
                    </View>
                  ))}
                </ListGroup>
              )}
              {note && (
                <Alert>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{note}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </>
          )}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
