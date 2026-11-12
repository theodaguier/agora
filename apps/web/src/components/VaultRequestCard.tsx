import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { StatusTone, VaultRequestDto, VaultRequestStatus } from "@agora/core";
import { FormLabel } from "@/components/FormLabel";
import { KeyIcon, LockIcon, UserIcon, UsersIcon } from "@/components/icons";
import { ItemLogo, safeMessages, useVaultName } from "@/components/safe/shared";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockCard, BlockFooter, BlockHeader, StatusLine } from "@/components/views/block";
import { api } from "@/lib/api";
import { usersQuery, vaultRequestQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const STATUS_TONE: Record<VaultRequestStatus, StatusTone> = { pending: "warning", approved: "success", denied: "danger", expired: "neutral" };

const messages = defineMessages({
  en: {
    status: { pending: "Awaiting an answer", approved: "Allowed", denied: "Declined", expired: "Expired" } as Record<VaultRequestStatus, string>,
    mine: (bot: string) => `${bot} wants to use your login`,
    theirs: (bot: string, person: string) => `${bot} wants to use ${person}'s login`,
    someone: "someone",
    fromVault: (vault: string) => `From the vault ${vault}`,
    approve: "Allow",
    deny: "Decline",
    waiting: (person: string) => `It's up to ${person} to answer.`,
    approved: "Allowed.",
    denied: "Declined.",
    unreachable: "This request is unreachable for now.",
    askMine: (bot: string, site: string) => `${bot} needs your login for ${site}`,
    askTheirs: (bot: string, site: string, person: string) => `${bot} needs ${person}'s login for ${site}`,
    askStatus: { pending: "Awaiting the login", approved: "Sent", denied: "Declined", expired: "Expired" } as Record<VaultRequestStatus, string>,
    vault: "Save in",
    show: "Show",
    hide: "Hide",
    send: "Save and send",
    sent: "Login saved in your vault and sent.",
    keptOnly: "Login saved in your vault. The bot had stopped waiting: ask it again.",
    savedIn: (vault: string) => `Saved in the vault ${vault}`,
  },
  fr: {
    status: { pending: "En attente de réponse", approved: "Autorisé", denied: "Refusé", expired: "Expiré" },
    mine: (bot: string) => `${bot} veut utiliser ton identifiant`,
    theirs: (bot: string, person: string) => `${bot} veut utiliser l'identifiant de ${person}`,
    someone: "quelqu'un",
    fromVault: (vault: string) => `Du coffre ${vault}`,
    approve: "Autoriser",
    deny: "Refuser",
    waiting: (person: string) => `C'est à ${person} de répondre.`,
    approved: "Autorisé.",
    denied: "Refusé.",
    unreachable: "Cette demande est injoignable pour le moment.",
    askMine: (bot: string, site: string) => `${bot} a besoin de ton identifiant pour ${site}`,
    askTheirs: (bot: string, site: string, person: string) => `${bot} a besoin de l'identifiant de ${person} pour ${site}`,
    askStatus: { pending: "En attente de l'identifiant", approved: "Transmis", denied: "Refusé", expired: "Expiré" },
    vault: "Enregistrer dans",
    show: "Afficher",
    hide: "Masquer",
    send: "Enregistrer et transmettre",
    sent: "Identifiant enregistré dans ton coffre et transmis.",
    keptOnly: "Identifiant enregistré dans ton coffre. Le bot n'attendait plus : relance-le.",
    savedIn: (vault: string) => `Enregistré dans le coffre ${vault}`,
  },
});

/**
 * A bot asking to use a login of the Coffre-fort during a turn. Only the person who started the
 * turn answers; the password goes to the bot, never into the conversation.
 */
export function VaultRequestCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const { user } = useRouteContext({ from: "/app" });
  const { data: req, error } = useQuery(vaultRequestQuery(id));
  const { data: people } = useQuery(usersQuery);
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<VaultRequestDto>(`/vaults/requests/${encodeURIComponent(id)}/${approve ? "approve" : "deny"}`, { method: "POST" }),
    onSuccess: (next) => qc.setQueryData(vaultRequestQuery(id).queryKey, next),
    // Already answered or expired: show where it stands.
    onError: () => qc.invalidateQueries({ queryKey: vaultRequestQuery(id).queryKey }),
    meta: { success: (next: VaultRequestDto) => (next.status === "approved" ? t.approved : t.denied), error: false },
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
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-40" />
        </CardHeader>
      </BlockCard>
    );

  const mine = req.requestedBy === user.id;
  const person = people?.find((p) => p.id === req.requestedBy)?.name ?? t.someone;
  const pending = req.status === "pending";
  if (req.kind === "ask") return <AskLoginCard req={req} mine={mine} person={person} />;

  return (
    <BlockCard>
      <BlockHeader
        icon={<LockIcon className="size-4" />}
        title={mine ? t.mine(req.agentName) : t.theirs(req.agentName, person)}
        action={(!pending || !mine) && <StatusLine tone={STATUS_TONE[req.status]}>{t.status[req.status]}</StatusLine>}
      />
      <CardContent className="flex flex-col gap-3">
        <Item variant="muted" size="sm">
          <ItemLogo item={{ kind: "login", website: req.item.website, title: req.item.title }} className="size-8" />
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">{req.item.title}</ItemTitle>
            <ItemDescription className="truncate">{req.item.username || t.fromVault(req.vaultName)}</ItemDescription>
          </ItemContent>
        </Item>
        {req.reason && <p className="text-sm">{req.reason}</p>}
        {pending && !mine && <p className="text-sm text-muted-foreground">{t.waiting(person)}</p>}
        {decide.error && pending && <p className="text-sm text-destructive">{decide.error.message}</p>}
      </CardContent>
      {pending && mine && (
        <BlockFooter>
          <Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
            {decide.isPending && decide.variables === false ? c.inProgress : t.deny}
          </Button>
          <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {decide.isPending && decide.variables ? c.inProgress : t.approve}
          </Button>
        </BlockFooter>
      )}
    </BlockCard>
  );
}

/**
 * A bot needing a login it doesn't have, for a site: its person types it here (never in the chat). It is
 * saved in the vault they choose among those the bot may read, then handed to the bot.
 */
function AskLoginCard({ req, mine, person }: { req: VaultRequestDto; mine: boolean; person: string }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const s = useT(safeMessages);
  const c = useT(common);
  const vaultName = useVaultName();
  const id = useId();
  const vaults = req.vaults ?? [];
  const [vaultId, setVaultId] = useState(vaults[0]?.id ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const pending = req.status === "pending";
  const done = (next: VaultRequestDto) => qc.setQueryData(vaultRequestQuery(req.id).queryKey, next);
  const refresh = () => qc.invalidateQueries({ queryKey: vaultRequestQuery(req.id).queryKey });
  const answer = useMutation({
    mutationFn: () =>
      api<VaultRequestDto>(`/vaults/requests/${encodeURIComponent(req.id)}/answer`, { method: "POST", body: JSON.stringify({ vaultId, username: username.trim(), password }) }),
    onSuccess: (next) => {
      setPassword("");
      done(next);
      void qc.invalidateQueries({ queryKey: ["vaults"] });
    },
    onError: refresh,
    meta: { success: (next: VaultRequestDto) => (next.status === "approved" ? t.sent : t.keptOnly), error: false },
  });
  const deny = useMutation({
    mutationFn: () => api<VaultRequestDto>(`/vaults/requests/${encodeURIComponent(req.id)}/deny`, { method: "POST" }),
    onSuccess: done,
    onError: refresh,
    meta: { success: t.denied, error: false },
  });
  const busy = answer.isPending || deny.isPending;
  const canSend = !!vaultId && !!username.trim() && !!password && !busy;
  const site = req.item.title;
  const error = answer.error ?? deny.error;

  return (
    <BlockCard>
      <BlockHeader
        icon={<KeyIcon className="size-4" />}
        title={mine ? t.askMine(req.agentName, site) : t.askTheirs(req.agentName, site, person)}
        action={(!pending || !mine) && <StatusLine tone={STATUS_TONE[req.status]}>{t.askStatus[req.status]}</StatusLine>}
      />
      <CardContent className="flex flex-col gap-3">
        <Item variant="muted" size="sm">
          <ItemLogo item={{ kind: "login", website: req.item.website, title: site }} className="size-8" />
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">{site}</ItemTitle>
            {req.item.username ? (
              <ItemDescription className="truncate">{req.item.username}</ItemDescription>
            ) : (
              req.item.website && <ItemDescription className="truncate">{req.item.website}</ItemDescription>
            )}
          </ItemContent>
        </Item>
        {req.reason && <p className="text-sm">{req.reason}</p>}
        {pending && !mine && <p className="text-sm text-muted-foreground">{t.waiting(person)}</p>}
        {!pending && req.vaultName && <p className="text-sm text-muted-foreground">{t.savedIn(req.vaultName)}</p>}

        {pending && mine && (
          <form
            id={`${id}-form`}
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) answer.mutate();
            }}
          >
            <FieldGroup>
              <Field>
                <FormLabel htmlFor={`${id}-username`} required>
                  {s.field.username}
                </FormLabel>
                <Input id={`${id}-username`} autoComplete="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field>
                <FormLabel htmlFor={`${id}-password`} required>
                  {s.field.password}
                </FormLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${id}-password`}
                    type={shown ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton onClick={() => setShown((x) => !x)}>{shown ? t.hide : t.show}</InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              {vaults.length > 1 && (
                <Field>
                  <FormLabel htmlFor={`${id}-vault`}>{t.vault}</FormLabel>
                  <Select items={vaults.map((v) => ({ value: v.id, label: vaultName(v) }))} value={vaultId} onValueChange={(v) => v && setVaultId(v as string)}>
                    <SelectTrigger id={`${id}-vault`} className="w-full">
                      <SelectValue>
                        {(value: string) => {
                          const v = vaults.find((x) => x.id === value);
                          return v ? (
                            <>
                              {v.kind === "personal" ? <UserIcon /> : <UsersIcon />}
                              {vaultName(v)}
                            </>
                          ) : null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false} align="start">
                      {vaults.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.kind === "personal" ? <UserIcon /> : <UsersIcon />}
                          {vaultName(v)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </FieldGroup>
          </form>
        )}
        {error && pending && <p className="text-sm text-destructive">{error.message}</p>}
      </CardContent>
      {pending && mine && (
        <BlockFooter>
          <Button variant="secondary" disabled={busy} onClick={() => deny.mutate()}>
            {deny.isPending ? c.inProgress : t.deny}
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!canSend}>
            {answer.isPending ? c.inProgress : t.send}
          </Button>
        </BlockFooter>
      )}
    </BlockCard>
  );
}
