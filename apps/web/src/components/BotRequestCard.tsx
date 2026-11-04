import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StatusTone } from "@agora/core";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    unreachable: "This bot request is unreachable for now.",
  },
  fr: {
    status: { pending: "En attente de validation", creating: "Création…", created: "Création terminée", rejected: "Refusé" },
    title: (n: number) => (n === 1 ? "Nouveau bot" : `${n} nouveaux bots`),
    approve: "Créer",
    reject: "Refuser",
    adminMust: "Un administrateur doit valider ces bots avant leur création.",
    unreachable: "Cette demande de bot est injoignable pour le moment.",
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

  if (error)
    return (
      <BlockCard>
        <CardHeader>
          <CardDescription title={error.message}>{t.unreachable}</CardDescription>
        </CardHeader>
      </BlockCard>
    );
  if (!req)
    return (
      <BlockCard>
        <CardHeader>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </CardHeader>
      </BlockCard>
    );

  const decides = req.status === "pending" && req.canDecide;

  return (
    <BlockCard>
      <CardHeader>
        <CardTitle>{t.title(req.bots.length)}</CardTitle>
        {req.reason && <CardDescription>{req.reason}</CardDescription>}
        <CardAction>
          <StatusLine tone={STATUS_TONE[req.status]}>{t.status[req.status]}</StatusLine>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ItemGroup>
          {req.bots.map((bot, i) => (
            <Item key={i} variant="outline" size="sm">
              <ItemMedia>
                <AgentAvatar agent={bot} className="size-8" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{bot.name}</ItemTitle>
                {(bot.role || bot.mission) && <ItemDescription>{bot.role ?? bot.mission}</ItemDescription>}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        {req.status === "pending" && !req.canDecide && <p className="text-sm text-muted-foreground">{t.adminMust}</p>}
        {(decide.error || req.error) && <p className="text-sm text-destructive">{decide.error?.message ?? req.error}</p>}
      </CardContent>
      {decides && (
        <BlockFooter>
          <Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
            {t.reject}
          </Button>
          <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
          </Button>
        </BlockFooter>
      )}
    </BlockCard>
  );
}
