import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StatusTone } from "@agora/core";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { BlockCard, BlockFooter, StatusLine } from "@/components/views/block";
import { api, type BotRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const STATUS_TONE: Record<BotRequest["status"], StatusTone> = { pending: "warning", creating: "info", created: "success", rejected: "danger" };

const messages = defineMessages({
  en: {
    status: { pending: "Awaiting approval", creating: "Creating…", created: "Done", rejected: "Rejected" } as Record<BotRequest["status"], string>,
    title: (n: number) => (n === 1 ? "New bot" : `${n} new bots`),
    approve: "Create",
    reject: "Reject",
    adminMust: "An admin must approve these bots before they're created.",
  },
  fr: {
    status: { pending: "En attente de validation", creating: "Création…", created: "Création terminée", rejected: "Refusé" },
    title: (n: number) => (n === 1 ? "Nouveau bot" : `${n} nouveaux bots`),
    approve: "Créer",
    reject: "Refuser",
    adminMust: "Un administrateur doit valider ces bots avant leur création.",
  },
});

/** Bots a bot asks to create (one per role to test, say): an admin approves, the app creates them. */
export function BotRequestCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const { data: req, error } = useQuery({
    queryKey: ["bot-request", id],
    queryFn: () => api<BotRequest>(`/bot-requests/${id}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "pending" || q.state.data.status === "creating") ? 4_000 : false),
  });
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<BotRequest>(`/bot-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: (next) => qc.setQueryData(["bot-request", id], next),
    meta: { error: false },
  });

  if (error || !req) return null;

  const decides = req.status === "pending" && req.canDecide;

  return (
    <BlockCard>
      <CardHeader>
        <CardTitle className="font-semibold">{t.title(req.bots.length)}</CardTitle>
        {req.reason && <CardDescription>{req.reason}</CardDescription>}
        <StatusLine tone={STATUS_TONE[req.status]} className="mt-1">
          {t.status[req.status]}
        </StatusLine>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ItemGroup className="gap-0 overflow-hidden rounded-[10px] border">
          {req.bots.map((bot, i) => (
            <Item key={i} className="rounded-none border-0 border-border px-3.5 py-2.5 not-last:border-b">
              <ItemMedia>
                <AgentAvatar agent={bot} className="size-8" />
              </ItemMedia>
              <ItemContent className="gap-0">
                <ItemTitle>{bot.name}</ItemTitle>
                {(bot.role || bot.mission) && <ItemDescription className="line-clamp-1 text-[13px]">{bot.role ?? bot.mission}</ItemDescription>}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        {req.status === "pending" && !req.canDecide && <p className="text-sm text-muted-foreground">{t.adminMust}</p>}
        {(decide.error || req.error) && <p className="text-sm text-destructive">{decide.error?.message ?? req.error}</p>}
      </CardContent>
      {decides && (
        <BlockFooter>
          <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
            {t.reject}
          </Button>
          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
          </Button>
        </BlockFooter>
      )}
    </BlockCard>
  );
}
