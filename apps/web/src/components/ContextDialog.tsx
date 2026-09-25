import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { numberFormat } from "@/lib/intl";
import { providerName } from "@/lib/providers";
import { contextQuery } from "@/lib/queries";

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
  const t = useT(messages);
  const { data, isPending, isError } = useQuery({ ...contextQuery(conversationId), enabled: open, refetchOnMount: "always" });
  const number = numberFormat({ notation: "compact", maximumFractionDigits: 1 });
  const session = data?.session;
  const percent = session?.window ? Math.min(100, Math.round((session.tokens / session.window) * 100)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <Spinner className="mx-auto my-6" />
        ) : isError ? (
          <p className="text-sm text-muted-foreground">{t.failed}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {session && (
              <Progress value={percent}>
                <ProgressLabel>{t.usage}</ProgressLabel>
                <ProgressValue>
                  {() => (session.window ? `≈ ${number.format(session.tokens)} / ${number.format(session.window)}` : `≈ ${number.format(session.tokens)} · ${t.unknownWindow}`)}
                </ProgressValue>
              </Progress>
            )}
            <ItemGroup>
              {data.model && (
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle>{t.model}</ItemTitle>
                    <ItemDescription>{data.model}</ItemDescription>
                  </ItemContent>
                </Item>
              )}
              {session && (
                <>
                  <Item size="sm">
                    <ItemContent>
                      <ItemTitle>{t.messages}</ItemTitle>
                      <ItemDescription>
                        {session.messages}
                        {session.autoCompressions > 0 && ` · ${t.autoCompressions(session.autoCompressions)}`}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                  <Item size="sm">
                    <ItemContent>
                      <ItemTitle>{t.totals}</ItemTitle>
                      <ItemDescription>
                        {t.totalsDetail(number.format(session.totals.input), number.format(session.totals.output), number.format(session.totals.cacheRead))}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                </>
              )}
            </ItemGroup>
            {data.compacted ? (
              <p className="text-sm text-muted-foreground">{t.compacted}</p>
            ) : (
              !session && <p className="text-sm text-muted-foreground">{data.engine !== "hermes" ? t.outside(providerName(data.engine)) : t.empty}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
