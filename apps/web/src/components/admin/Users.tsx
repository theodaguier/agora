import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { CalendarClockIcon, MailIcon, CloseIcon, MoreIcon } from "@/components/icons";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, type FormEvent } from "react";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { api, type AdminInvitation, type AdminUser, type InvitationSent } from "@/lib/api";
import { adminInvitationsQuery, adminUsersQuery } from "@/lib/queries";
import { common } from "@agora/core/i18n";
import { defineMessages, intlLocale, useLocale, useT } from "@/i18n";
import { ErrorText, SectionHeader } from "./ui";

const messages = defineMessages({
  en: {
    title: "Users",
    text: "Invite someone by email: they create their profile from the link they receive. You can then change their role and access.",
    email: "Email",
    emailPlaceholder: "firstname@example.com",
    sending: "Sending…",
    invite: "Invite",
    inviteLegend: "Invite someone",
    members: "Members",
    pending: "Pending",
    member: "Member",
    memberHelp: "Uses the agents opened to them.",
    admin: "Admin",
    adminHelp: "Manages users, agents and access, sees everyone's usage and approves requests.",
    access: "Access",
    roleOf: (name: string) => `${name}'s role`,
    scheduleOf: (name: string) => `${name}'s availability`,
    scheduleHelp: "Working hours, absences and do not disturb, seen by colleagues and bots.",
    roleTitle: "Role shown on the profile",
    addRole: "Add a role",
    ownAccess: "You can't change your own access.",
    expired: "link expired",
    invitedOn: (date: string) => `invited ${date}`,
    resend: "Resend",
    revoke: "Cancel invitation",
    revokeTitle: (email: string) => `Cancel the invitation for ${email}?`,
    revokeBody: "The link sent by email will stop working. You can invite them again later.",
    sentTo: (email: string) => `Invitation sent to ${email}.`,
    mailOff: "Sending emails isn't set up.",
    passLink: (email: string) => `Send this link to ${email}:`,
    copied: "Copied",
    copy: "Copy",
    actions: "Actions",
    remove: "Delete",
    removeTitle: (name: string) => `Delete ${name}'s account?`,
    removeBody:
      "They are signed out everywhere and lose access to the app. Their messages, tasks and conversations stay, without their name. This can't be undone, but you can invite them again.",
    removed: (name: string) => `${name}'s account was deleted.`,
    revoked: "Invitation canceled.",
  },
  fr: {
    title: "Utilisateurs",
    text: "Invite quelqu'un par email : il crée son profil depuis le lien reçu. Tu peux ensuite changer son rôle et son accès.",
    email: "Email",
    emailPlaceholder: "prenom@exemple.com",
    sending: "Envoi…",
    invite: "Inviter",
    inviteLegend: "Inviter quelqu'un",
    members: "Membres",
    pending: "En attente",
    member: "Membre",
    memberHelp: "Utilise les agents qui lui sont ouverts.",
    admin: "Admin",
    adminHelp: "Gère les utilisateurs, les agents et les accès, voit la consommation de tous et valide les demandes.",
    access: "Accès",
    roleOf: (name: string) => `Rôle de ${name}`,
    scheduleOf: (name: string) => `Disponibilité de ${name}`,
    scheduleHelp: "Horaires, absences et ne pas déranger, visibles par les collègues et les bots.",
    roleTitle: "Rôle affiché sur le profil",
    addRole: "Ajouter un rôle",
    ownAccess: "Tu ne peux pas modifier ton propre accès.",
    expired: "lien expiré",
    invitedOn: (date: string) => `invité le ${date}`,
    resend: "Renvoyer",
    revoke: "Annuler l'invitation",
    revokeTitle: (email: string) => `Annuler l'invitation de ${email} ?`,
    revokeBody: "Le lien envoyé par email ne fonctionnera plus. Tu pourras l'inviter à nouveau.",
    sentTo: (email: string) => `Invitation envoyée à ${email}.`,
    mailOff: "L'envoi d'emails n'est pas configuré.",
    passLink: (email: string) => `Transmets ce lien à ${email} :`,
    copied: "Copié",
    copy: "Copier",
    actions: "Actions",
    remove: "Supprimer",
    removeTitle: (name: string) => `Supprimer le compte de ${name} ?`,
    removeBody:
      "Ses sessions sont fermées partout et l'app ne lui est plus accessible. Ses messages, tâches et conversations restent, sans son nom. C'est définitif, mais tu pourras l'inviter à nouveau.",
    removed: (name: string) => `Le compte de ${name} a été supprimé.`,
    revoked: "Invitation annulée.",
  },
});

type InviteBody = { email: string; role: string };

export function Users() {
  const t = useT(messages);
  const qc = useQueryClient();
  const { data: users = [] } = useQuery(adminUsersQuery);
  const { data: invitations = [] } = useQuery(adminInvitationsQuery);
  /** Result of the last send, shown until the next invitation. */
  const [result, setResult] = useState<(InvitationSent & { email: string }) | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: adminInvitationsQuery.queryKey });
  const invite = useMutation({
    mutationFn: (body: InviteBody) => api<InvitationSent>("/admin/invitations", { method: "POST", body: JSON.stringify(body) }),
    onMutate: () => setResult(null),
    onSuccess: (sent, body) => {
      setResult({ ...sent, email: body.email });
      refresh();
    },
    meta: { loading: t.sending, success: (sent: InvitationSent, body: InviteBody) => (sent.sent ? t.sentTo(body.email) : undefined), error: false },
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    invite.mutate(
      { email: String(f.get("email") ?? "").trim(), role: String(f.get("role")) },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <>
      <SectionHeader title={t.title} text={t.text} />
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t.inviteLegend}</FieldLegend>
          {/* A single row: address, access, send. The invitee fills in the rest of the profile. */}
          <form onSubmit={submit}>
            <Field orientation="horizontal">
              <Input name="email" type="email" required aria-label={t.email} placeholder={t.emailPlaceholder} autoComplete="off" />
              <AccessSelect name="role" defaultValue="user" className="w-32 shrink-0" />
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? t.sending : t.invite}
              </Button>
            </Field>
          </form>
          <ErrorText error={invite.error} />
          {result && <SentNotice result={result} email={result.email} />}
        </FieldSet>

        {invitations.length > 0 && (
          <>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>{t.pending}</FieldLegend>
              <ItemGroup className="gap-2">
                {invitations.map((inv) => (
                  <PendingInvitation key={inv.id} invitation={inv} onSent={(sent) => setResult({ ...sent, email: inv.email })} onChange={refresh} />
                ))}
              </ItemGroup>
            </FieldSet>
          </>
        )}

        <FieldSeparator />
        <FieldSet>
          <FieldLegend>{t.members}</FieldLegend>
          <ItemGroup className="gap-2">
            {users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </ItemGroup>
        </FieldSet>
      </FieldGroup>
    </>
  );
}

/** App access (admin/member); not to be confused with the profile's free-text role. */
function AccessSelect({
  className,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  title,
}: {
  className?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  title?: string;
}) {
  const t = useT(messages);
  const access = [
    { value: "user", label: t.member, help: t.memberHelp },
    { value: "admin", label: t.admin, help: t.adminHelp },
  ];
  return (
    <Select
      items={access}
      value={value}
      defaultValue={defaultValue}
      name={name}
      disabled={disabled}
      onValueChange={(v) => v != null && onValueChange?.(v as string)}
    >
      <SelectTrigger aria-label={t.access} title={title} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end" className="w-72">
        {access.map((a) => (
          <SelectItem key={a.value} value={a.value} className="items-start *:data-[slot=select-item-text]:whitespace-normal">
            <span className="flex flex-col gap-0.5">
              <span>{a.label}</span>
              <span className="text-muted-foreground">{a.help}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserRow({ user: u }: { user: AdminUser }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const me = useRouteContext({ from: "/app" }).user.id;
  const [title, setTitle] = useState(u.title);
  const [scheduling, setScheduling] = useState(false);
  const update = useMutation({
    mutationFn: (patch: { role?: string; title?: string }) =>
      api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSettled: () => qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }),
    onError: () => setTitle(u.title),
    meta: { success: c.saved },
  });
  const remove = useMutation({
    mutationFn: () => api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }),
    meta: { success: t.removed(u.name) },
  });
  const saveTitle = () => {
    const next = title.trim();
    if (!next) return setTitle(u.title);
    if (next !== u.title) update.mutate({ title: next });
  };

  return (
    <Item variant="outline">
      <ItemMedia>
        <PersonAvatar person={u} className="size-9" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{u.name}</ItemTitle>
        <ItemDescription className="truncate">
          {u.username ? `@${u.username} · ` : ""}
          {u.email}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Input
          aria-label={t.roleOf(u.name)}
          title={t.roleTitle}
          value={title}
          maxLength={60}
          placeholder={t.addRole}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setTitle(u.title);
              e.currentTarget.blur();
            }
          }}
          className="w-40"
        />
        <AccessSelect
          className="w-32"
          value={u.role === "admin" ? "admin" : "user"}
          disabled={u.id === me || update.isPending}
          title={u.id === me ? t.ownAccess : undefined}
          onValueChange={(role) => update.mutate({ role })}
        />
        <Button variant="ghost" size="icon-sm" aria-label={t.scheduleOf(u.name)} title={t.scheduleOf(u.name)} onClick={() => setScheduling(true)}>
          <CalendarClockIcon />
        </Button>
        <Dialog open={scheduling} onOpenChange={setScheduling}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t.scheduleOf(u.name)}</DialogTitle>
              <DialogDescription>{t.scheduleHelp}</DialogDescription>
            </DialogHeader>
            {scheduling && <AvailabilityEditor userId={u.id} self={u.id === me} />}
          </DialogContent>
        </Dialog>
        {u.id === me ? (
          <span aria-hidden className="size-7 shrink-0" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} disabled={remove.isPending} />}>
              <MoreIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={async () =>
                  (await confirmAction({ title: t.removeTitle(u.name), description: t.removeBody, action: t.remove })) && remove.mutate()
                }
              >
                {t.remove}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ItemActions>
    </Item>
  );
}

function PendingInvitation({
  invitation: inv,
  onSent,
  onChange,
}: {
  invitation: AdminInvitation;
  onSent: (sent: InvitationSent) => void;
  onChange: () => void;
}) {
  const t = useT(messages);
  const locale = intlLocale(useLocale());
  const expired = new Date(inv.expiresAt) < new Date();
  const resend = useMutation({
    mutationFn: () => api<InvitationSent>(`/admin/invitations/${encodeURIComponent(inv.id)}/resend`, { method: "POST" }),
    onSuccess: (sent) => {
      onSent(sent);
      onChange();
    },
    meta: { loading: t.sending, success: (sent: InvitationSent) => (sent.sent ? t.sentTo(inv.email) : undefined) },
  });
  const revoke = useMutation({
    mutationFn: () => api(`/admin/invitations/${encodeURIComponent(inv.id)}`, { method: "DELETE" }),
    onSuccess: onChange,
    meta: { success: t.revoked },
  });

  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <MailIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{inv.email}</ItemTitle>
        <ItemDescription className="truncate">
          {inv.role === "admin" ? t.admin : t.member} ·{" "}
          {expired ? t.expired : t.invitedOn(new Date(inv.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" }))}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" disabled={resend.isPending} onClick={() => resend.mutate()}>
          {t.resend}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t.revoke} title={t.revoke} disabled={revoke.isPending} onClick={async () => (await confirmAction({ title: t.revokeTitle(inv.email), description: t.revokeBody, action: t.revoke })) && revoke.mutate()}>
          <CloseIcon />
        </Button>
      </ItemActions>
    </Item>
  );
}

/** Without email configured (or on failure), the link to pass on yourself; a sent invitation is said by a toast. */
function SentNotice({ result, email }: { result: InvitationSent; email: string }) {
  const t = useT(messages);
  const [copied, setCopied] = useState(false);
  if (result.sent) return null;
  return (
    <Alert>
      <AlertTitle>{result.error ?? t.mailOff}</AlertTitle>
      <AlertDescription>
        {t.passLink(email)}
        <Field orientation="horizontal" className="mt-2">
          <Input readOnly value={result.link ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(result.link ?? "");
              setCopied(true);
            }}
          >
            {copied ? t.copied : t.copy}
          </Button>
        </Field>
      </AlertDescription>
    </Alert>
  );
}
