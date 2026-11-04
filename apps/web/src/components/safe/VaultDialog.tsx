import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import type { VaultSummary } from "@agora/core";
import { ErrorText } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { FormLabel } from "@/components/FormLabel";
import { AgentTargets } from "@/components/marketplace/AgentTargets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { agentsQuery, usersQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    newTitle: "New shared vault",
    newText: "For logins and cards a team uses together. Every member sees and edits its items.",
    personalTitle: "Personal vault",
    personalText: "Only you see it. Choose which bots may read it when you talk to them.",
    sharedTitle: (name: string) => `${name} settings`,
    sharedText: "Every member sees and edits its items.",
    name: "Name",
    members: "Members",
    membersHint: "They see and edit this vault's items.",
    noColleagues: "No colleagues yet.",
    colleaguesUnavailable: "Colleagues unreachable for now.",
    bots: "Allowed bots",
    botsHint: "They can read this vault for a member who talks to them. Using a password always asks that member first.",
    noBots: "No bots to choose from.",
    always: "Always",
    created: "Shared vault created.",
    deleteVault: "Delete vault",
    deleteTitle: (name: string) => `Delete “${name}”?`,
    deleteText: "Its logins, cards and contact details are deleted for every member. This can't be undone.",
  },
  fr: {
    newTitle: "Nouveau coffre partagé",
    newText: "Pour les identifiants et cartes qu'une équipe utilise ensemble. Chaque membre voit et modifie ses éléments.",
    personalTitle: "Coffre personnel",
    personalText: "Il n'est visible que par toi. Choisis les bots qui peuvent le lire quand tu leur parles.",
    sharedTitle: (name: string) => `Réglages de « ${name} »`,
    sharedText: "Chaque membre voit et modifie ses éléments.",
    name: "Nom",
    members: "Membres",
    membersHint: "Ils voient et modifient les éléments de ce coffre.",
    noColleagues: "Aucun collègue pour l'instant.",
    colleaguesUnavailable: "Collègues injoignables pour l'instant.",
    bots: "Bots autorisés",
    botsHint: "Ils peuvent lire ce coffre pour un membre qui leur parle. Utiliser un mot de passe demande toujours son accord.",
    noBots: "Aucun bot à choisir.",
    always: "Toujours",
    created: "Coffre partagé créé.",
    deleteVault: "Supprimer le coffre",
    deleteTitle: (name: string) => `Supprimer « ${name} » ?`,
    deleteText: "Ses identifiants, cartes et coordonnées sont supprimés pour tous ses membres. C'est définitif.",
  },
});

/**
 * A vault's settings, or a new shared vault (`vault` undefined): its name and members (shared only),
 * and the bots that may read it. Ids the person can't see (a colleague's bot) are kept as they are.
 */
export function VaultDialog({ vault, onDone, onDeleted }: { vault?: VaultSummary; onDone: (vault: VaultSummary | undefined) => void; onDeleted?: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { user } = useRouteContext({ from: "/app" });
  const shared = vault?.kind !== "personal";
  const [name, setName] = useState(vault?.name ?? "");
  const [members, setMembers] = useState<string[]>(() => (vault?.memberIds ?? []).filter((id) => id !== user.id));
  const [bots, setBots] = useState<string[]>(vault?.agentIds ?? []);
  const [tried, setTried] = useState(false);
  const colleagues = useQuery({ ...usersQuery, enabled: shared });
  const myBots = useQuery(agentsQuery);
  const choosable = (myBots.data ?? []).map((a) => ({ id: a.id, name: a.name, avatarShape: a.avatar.shape, avatarColor: a.avatar.color, hermesProfile: "" }));

  const save = useMutation({
    mutationFn: () => {
      // A colleague's bot this person can't talk to stays allowed: they can't see it to take it off.
      const mine = new Set(choosable.map((a) => a.id));
      const hidden = (vault?.agentIds ?? []).filter((id) => !mine.has(id));
      const body = { ...(shared && { name: name.trim(), memberIds: members }), agentIds: [...new Set([...bots.filter((id) => mine.has(id)), ...hidden])] };
      return vault
        ? // Nothing back (204) when the person took themself off the members.
          api<VaultSummary | undefined>(`/vaults/${encodeURIComponent(vault.id)}`, { method: "PATCH", body: JSON.stringify(body) })
        : api<VaultSummary>("/vaults", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ["vaults"], exact: true });
      onDone(saved);
    },
    meta: { success: vault ? c.saved : t.created, error: false },
  });
  const remove = useMutation({
    mutationFn: () => api(`/vaults/${encodeURIComponent(vault!.id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["vaults"], exact: true });
      onDeleted?.();
    },
    meta: { success: c.deleted },
  });

  const nameMissing = shared && !name.trim();
  const toggleMember = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{!vault ? t.newTitle : shared ? t.sharedTitle(vault.name) : t.personalTitle}</DialogTitle>
        <DialogDescription>{!vault ? t.newText : shared ? t.sharedText : t.personalText}</DialogDescription>
      </DialogHeader>
      <form
        id="vault-settings"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!nameMissing) save.mutate();
        }}
      >
        <FieldGroup>
          {shared && (
            <Field data-invalid={(tried && nameMissing) || undefined}>
              <FormLabel htmlFor="vault-name" required>
                {t.name}
              </FormLabel>
              <Input
                id="vault-name"
                autoComplete="off"
                autoFocus={!vault}
                maxLength={120}
                aria-invalid={(tried && nameMissing) || undefined}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          {shared && (
            <FieldSet className="gap-3">
              <div className="flex flex-col gap-1">
                <FieldLegend variant="label" className="mb-0">
                  {t.members}
                </FieldLegend>
                <FieldDescription>{t.membersHint}</FieldDescription>
              </div>
              <ItemGroup className="gap-0 overflow-hidden rounded-xl bg-muted/50 has-data-[size=sm]:gap-0">
                <Item size="sm" className="rounded-none" data-disabled>
                  <ItemMedia>
                    <PersonAvatar person={{ id: user.id, name: user.name, image: user.image ?? null }} className="size-6" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{c.you}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant="secondary">{t.always}</Badge>
                    <Checkbox checked disabled aria-label={c.you} />
                  </ItemActions>
                </Item>
                {colleagues.isPending &&
                  [0, 1].map((i) => (
                    <Fragment key={i}>
                      <ItemSeparator className="my-0" />
                      <Item size="sm" className="rounded-none">
                        <ItemMedia>
                          <Skeleton className="size-6 rounded-full" />
                        </ItemMedia>
                        <ItemContent>
                          <Skeleton className="h-4 w-1/3" />
                        </ItemContent>
                      </Item>
                    </Fragment>
                  ))}
                {!colleagues.isPending && !colleagues.data?.length && (
                  <>
                    <ItemSeparator className="my-0" />
                    <p className="px-3 py-2.5 text-sm text-muted-foreground">{colleagues.isError ? t.colleaguesUnavailable : t.noColleagues}</p>
                  </>
                )}
                {colleagues.data?.map((p) => (
                  <Fragment key={p.id}>
                    <ItemSeparator className="my-0" />
                    <Item size="sm" className="rounded-none" render={<label htmlFor={`member-${p.id}`} />}>
                      <ItemMedia>
                        <PersonAvatar person={p} className="size-6" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{p.name}</ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <Checkbox id={`member-${p.id}`} checked={members.includes(p.id)} onCheckedChange={() => toggleMember(p.id)} />
                      </ItemActions>
                    </Item>
                  </Fragment>
                ))}
              </ItemGroup>
            </FieldSet>
          )}
          {myBots.isError || (!myBots.isPending && !choosable.length) ? (
            <FieldSet className="gap-1">
              <FieldLegend variant="label" className="mb-0">
                {t.bots}
              </FieldLegend>
              <FieldDescription>{t.noBots}</FieldDescription>
            </FieldSet>
          ) : (
            <AgentTargets legend={t.bots} hint={t.botsHint} value={bots} onChange={setBots} agents={choosable} loading={myBots.isPending} />
          )}
          <ErrorText error={save.error} />
        </FieldGroup>
      </form>
      <DialogFooter>
        {vault && shared && vault.canManage && (
          <Button
            variant="destructive"
            className="sm:mr-auto"
            disabled={remove.isPending || save.isPending}
            onClick={async () => (await confirmAction({ title: t.deleteTitle(vault.name), description: t.deleteText, action: c.delete })) && remove.mutate()}
          >
            {t.deleteVault}
          </Button>
        )}
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="vault-settings" disabled={save.isPending || (tried && nameMissing)}>
          {save.isPending ? (vault ? c.saving : c.creating) : vault ? c.save : c.create}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
