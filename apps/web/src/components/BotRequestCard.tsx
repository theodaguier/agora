import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "@/components/icons";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { api, type BotRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

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

  return (
    <div className="w-full max-w-[min(680px,88%)] rounded-2xl bg-secondary p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[15px] font-medium leading-snug">{t.title(req.bots.length)}</p>
        <Badge variant="secondary" className="bg-accent font-normal text-muted-foreground">
          {req.status === "created" && <CheckIcon data-icon="inline-start" />}
          {req.status === "creating" && <Spinner data-icon="inline-start" />}
          {t.status[req.status]}
        </Badge>
      </div>
      {req.reason && <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">{req.reason}</p>}
      <ItemGroup className="mt-2.5">
        {req.bots.map((bot, i) => (
          <Item key={i} size="xs" className="px-0">
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
      {(req.status === "pending" || req.error || decide.error) && (
        <div className="mt-3 flex flex-col gap-2">
          {req.status === "pending" &&
            (req.canDecide ? (
              <div className="flex gap-2">
                <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                  {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
                </Button>
                <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                  {t.reject}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.adminMust}</p>
            ))}
          {(decide.error || req.error) && <p className="text-sm text-destructive">{decide.error?.message ?? req.error}</p>}
        </div>
      )}
    </div>
  );
}
