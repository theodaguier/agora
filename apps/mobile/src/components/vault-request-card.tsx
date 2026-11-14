import type { StatusTone, VaultRequestDto, VaultRequestStatus } from "@agora/core";
import { CardFields } from "@/components/admin/ui";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Button, Card, ListGroup, SkeletonGroup, Typography, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { BrandLogo } from "@/components/brand-logo";
import { KeyIcon, LockIcon } from "@/components/icons";
import { LoginField } from "@/components/login-field";
import { TapMenu } from "@/components/menus";
import { useMe } from "@/components/server-scope";
import { BlockGroup, BlockHeader, blockCard, StatusLine } from "@/components/views/block";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { usersQuery } from "@/lib/queries";
import { vaultRequestQuery } from "@/lib/requests";

/*
 * apps/web/src/components/VaultRequestCard.tsx: a bot asking, during a turn, to use a login of the
 * vault (« Autoriser » / « Refuser »), or for a login it doesn't have, typed here and never in the
 * chat. Only the person who started the turn answers.
 */

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
    personal: "Personal",
    username: "Username",
    password: "Password",
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
    personal: "Personnel",
    username: "Nom d'utilisateur",
    password: "Mot de passe",
    send: "Enregistrer et transmettre",
    sent: "Identifiant enregistré dans ton coffre et transmis.",
    keptOnly: "Identifiant enregistré dans ton coffre. Le bot n'attendait plus : relance-le.",
    savedIn: (vault: string) => `Enregistré dans le coffre ${vault}`,
  },
});

/** "https://www.ovh.com/login" → "ovh.com": the site whose logo stands for the login. */
const domainOf = (website: string | null) => {
  if (!website) return null;
  const m = /^(?:[a-z]+:\/\/)?(?:www\.)?([^/:?#]+)/i.exec(website.trim());
  return m?.[1]?.toLowerCase() ?? null;
};

/** The login asked for: the site's logo, its name, the username (or where it comes from). */
function LoginItem({ title, website, detail }: { title: string; website: string | null; detail?: string | null }) {
  return (
    <BlockGroup>
      <ListGroup.Item disabled className="gap-3 px-3.5 py-2.5">
        <ListGroup.ItemPrefix>
          <BrandLogo domain={domainOf(website)} fallback={<LockIcon size={16} className="text-muted" />} className="size-8 rounded-lg" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle numberOfLines={1}>{title}</ListGroup.ItemTitle>
          {!!detail && <ListGroup.ItemDescription numberOfLines={1}>{detail}</ListGroup.ItemDescription>}
        </ListGroup.ItemContent>
      </ListGroup.Item>
    </BlockGroup>
  );
}

export function VaultRequestCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const me = useMe();
  const { toast } = useToast();
  const { data: req, error } = useQuery(vaultRequestQuery(id));
  const { data: people } = useQuery(usersQuery);
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<VaultRequestDto>(`/vaults/requests/${encodeURIComponent(id)}/${approve ? "approve" : "deny"}`, { method: "POST" }),
    onSuccess: (next) => {
      qc.setQueryData(vaultRequestQuery(id).queryKey, next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: next.status === "approved" ? "success" : "default", label: next.status === "approved" ? t.approved : t.denied });
    },
    // Already answered or expired: show where it stands.
    onError: () => qc.invalidateQueries({ queryKey: vaultRequestQuery(id).queryKey }),
  });

  if (error)
    return (
      <Card className={blockCard}>
        <Card.Description>{t.unreachable}</Card.Description>
      </Card>
    );
  if (!req)
    return (
      <Card className={blockCard}>
        <SkeletonGroup isLoading isSkeletonOnly className="gap-2">
          <SkeletonGroup.Item className="h-4 w-3/4 rounded-md" />
          <SkeletonGroup.Item className="h-3 w-1/2 rounded-md" />
        </SkeletonGroup>
      </Card>
    );

  const mine = req.requestedBy === me.id;
  const person = people?.find((p) => p.id === req.requestedBy)?.name ?? t.someone;
  const pending = req.status === "pending";
  if (req.kind === "ask") return <AskLoginCard req={req} mine={mine} person={person} />;

  return (
    <Card className={blockCard}>
      <BlockHeader
        icon={<LockIcon size={16} className="text-muted" />}
        title={mine ? t.mine(req.agentName) : t.theirs(req.agentName, person)}
        status={(!pending || !mine) && <StatusLine tone={STATUS_TONE[req.status]} label={t.status[req.status]} />}
      />
      <Card.Body className="gap-3">
        <LoginItem title={req.item.title} website={req.item.website} detail={req.item.username || t.fromVault(req.vaultName)} />
        {!!req.reason && <Typography type="body-sm">{req.reason}</Typography>}
        {pending && !mine && (
          <Typography type="body-sm" color="muted">
            {t.waiting(person)}
          </Typography>
        )}
        {!!decide.error && pending && (
          <Typography type="body-sm" className="text-danger">
            {decide.error.message}
          </Typography>
        )}
      </Card.Body>
      {pending && mine && (
        <Card.Footer className="flex-row justify-end gap-2">
          <Button size="sm" variant="secondary" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(false))}>
            {decide.isPending && decide.variables === false ? c.inProgress : t.deny}
          </Button>
          <Button size="sm" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(true))}>
            {decide.isPending && decide.variables ? c.inProgress : t.approve}
          </Button>
        </Card.Footer>
      )}
    </Card>
  );
}

/**
 * A bot needing a login it doesn't have, for a site: its person types it here (never in the chat). It is
 * saved in the vault they choose among those the bot may read, then handed to the bot.
 */
function AskLoginCard({ req, mine, person }: { req: VaultRequestDto; mine: boolean; person: string }) {
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { toast } = useToast();
  const vaults = req.vaults ?? [];
  const vaultName = (v: { kind: string; name: string }) => (v.kind === "personal" ? t.personal : v.name);
  const [vaultId, setVaultId] = useState(vaults[0]?.id ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: next.status === "approved" ? t.sent : t.keptOnly });
    },
    onError: refresh,
  });
  const deny = useMutation({
    mutationFn: () => api<VaultRequestDto>(`/vaults/requests/${encodeURIComponent(req.id)}/deny`, { method: "POST" }),
    onSuccess: (next) => {
      done(next);
      toast.show({ variant: "default", label: t.denied });
    },
    onError: refresh,
  });
  const busy = answer.isPending || deny.isPending;
  const canSend = !!vaultId && !!username.trim() && !!password && !busy;
  const site = req.item.title;
  const error = answer.error ?? deny.error;
  const vault = vaults.find((v) => v.id === vaultId);

  return (
    // A card of the thread: its fields keep their own box (CardFields), no white group inside the card.
    <CardFields>
    <Card className={blockCard}>
      <BlockHeader
        icon={<KeyIcon size={16} className="text-muted" />}
        title={mine ? t.askMine(req.agentName, site) : t.askTheirs(req.agentName, site, person)}
        status={(!pending || !mine) && <StatusLine tone={STATUS_TONE[req.status]} label={t.askStatus[req.status]} />}
      />
      <Card.Body className="gap-3">
        <LoginItem title={site} website={req.item.website} detail={req.item.username || req.item.website} />
        {!!req.reason && <Typography type="body-sm">{req.reason}</Typography>}
        {pending && !mine && (
          <Typography type="body-sm" color="muted">
            {t.waiting(person)}
          </Typography>
        )}
        {!pending && !!req.vaultName && (
          <Typography type="body-sm" color="muted">
            {t.savedIn(req.vaultName)}
          </Typography>
        )}
        {pending && mine && (
          <View className="gap-3">
            <LoginField label={t.username} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="off" />
            <LoginField
              label={t.password}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="send"
              onSubmitEditing={() => canSend && answer.mutate()}
            />
            {vaults.length > 1 && !!vault && (
              <View className="flex-row items-center justify-between gap-3">
                <Typography type="body-sm" color="muted">
                  {t.vault}
                </Typography>
                <TapMenu
                  accessibilityLabel={t.vault}
                  actions={vaults.map((v) => ({
                    label: vaultName(v),
                    icon: v.kind === "personal" ? "person" : "person.2",
                    checked: v.id === vaultId,
                    onPress: () => setVaultId(v.id),
                  }))}
                >
                  <Button size="sm" variant="secondary">
                    {vaultName(vault)}
                  </Button>
                </TapMenu>
              </View>
            )}
          </View>
        )}
        {!!error && pending && (
          <Typography type="body-sm" className="text-danger">
            {error.message}
          </Typography>
        )}
      </Card.Body>
      {pending && mine && (
        <Card.Footer className="flex-row justify-end gap-2">
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={withTap(() => deny.mutate())}>
            {deny.isPending ? c.inProgress : t.deny}
          </Button>
          <Button size="sm" isDisabled={!canSend} onPress={withTap(() => answer.mutate())}>
            {answer.isPending ? c.inProgress : t.send}
          </Button>
        </Card.Footer>
      )}
    </Card>
    </CardFields>
  );
}
