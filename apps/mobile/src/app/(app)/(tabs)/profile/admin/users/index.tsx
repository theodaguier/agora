import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Chip, ListGroup } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, Intro, LoadingRows, PressableRow, RowMenu, Section, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { InviteSheet, SentNotice, type Access } from "@/components/admin/users";
import { usersMessages } from "@/components/admin/users-messages";
import { confirmAction } from "@/components/confirm-action";
import { PersonAvatar } from "@/components/conversation-avatar";
import { MailIcon, UserPlusIcon } from "@/components/icons";
import { useMe } from "@/components/server-scope";
import { api } from "@/lib/api";
import { adminInvitationsQuery, adminUsersQuery, type AdminInvitation, type AdminUser, type InvitationSent } from "@/lib/admin";
import { locale, tr } from "@/lib/i18n";
import { TapMenu, type MenuEntry } from "@/components/menus";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/admin/Users.tsx */

export default function Users() {
  return (
    <>
      <Stack.Screen.Title>{usersMessages.title}</Stack.Screen.Title>
      <AdminGate>
        <UsersList />
      </AdminGate>
    </>
  );
}

function UsersList() {
  const t = usersMessages;
  const qc = useQueryClient();
  const users = useQuery(adminUsersQuery);
  const invitations = useQuery(adminInvitationsQuery);
  const toast = useAdminToast();
  const [inviting, setInviting] = useState(false);
  /** Last invitation the server couldn't email: its link stays on screen until the next invitation. */
  const [result, setResult] = useState<(InvitationSent & { email: string }) | null>(null);
  /** A sent invitation is confirmed by a toast; an unsent one shows its link to pass on. */
  const onSent = (sent: InvitationSent, email: string) => (sent.sent ? toast.success(t.sentTo(email)) : setResult({ ...sent, email }));

  const refresh = () => qc.invalidateQueries({ queryKey: adminInvitationsQuery.queryKey });
  const invite = useMutation({
    mutationFn: (body: { email: string; role: Access }) => api<InvitationSent>("/admin/invitations", { method: "POST", body: JSON.stringify(body) }),
    onMutate: () => setResult(null),
    onSuccess: (sent, body) => {
      onSent(sent, body.email);
      setInviting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    },
  });

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.userPlus} iconRenderingMode="template" accessibilityLabel={t.inviteLegend} onPress={withTap(() => (invite.reset(), setInviting(true)))} />
      </Stack.Toolbar>
      <SettingsScroll onRefresh={() => Promise.all([users.refetch(), invitations.refetch()])}>
        <Intro>{t.text}</Intro>
        {result && <SentNotice result={result} email={result.email} />}

        {!!invitations.data?.length && (
          <Section title={t.pending}>
            {invitations.data.map((inv) => (
              <PendingInvitation key={inv.id} invitation={inv} onSent={(sent) => onSent(sent, inv.email)} onChange={refresh} />
            ))}
          </Section>
        )}

        {users.data ? (
          <Section title={t.members}>
            {users.data.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </Section>
        ) : users.error ? (
          <ErrorAlert error={users.error} />
        ) : (
          <LoadingRows rows={4} />
        )}
      </SettingsScroll>
      <InviteSheet isOpen={inviting} onOpenChange={setInviting} onInvite={(body) => invite.mutateAsync(body)} pending={invite.isPending} error={invite.error} />
    </>
  );
}

function UserRow({ user: u }: { user: AdminUser }) {
  const t = usersMessages;
  const me = useMe().id;
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const admin = u.role === "admin";
  const setRole = useMutation({
    mutationFn: (role: Access) => api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onError: (e) => toast.failed(e),
    onSettled: () => qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }),
  });
  const open = () => router.push({ pathname: "/profile/admin/users/[userId]", params: { userId: u.id } });

  return (
    <RowMenu
      actions={[
        { label: admin ? t.makeMember : t.makeAdmin, icon: admin ? "person" : "person.badge.key", disabled: u.id === me, onPress: () => setRole.mutate(admin ? "user" : "admin") },
        { label: tr(common).edit, icon: "pencil", onPress: open },
        {
          label: t.scheduleOf(u.name),
          icon: "calendar.badge.clock",
          onPress: () => router.push({ pathname: "/profile/availability", params: u.id === me ? {} : { userId: u.id } }),
        },
      ]}
 >
      <PressableRow onPress={open}>
        <ListGroup.ItemPrefix>
          <PersonAvatar person={u} className="size-10" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle numberOfLines={1}>{u.id === me ? `${u.name} (${t.you})` : u.name}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription numberOfLines={1}>{[u.title, u.username ? `@${u.username}` : null, u.email].filter(Boolean).join(" · ")}</ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        {admin && (
          <Chip size="sm" variant="soft" color="accent">
            <Chip.Label>{t.admin}</Chip.Label>
          </Chip>
        )}
        <ListGroup.ItemSuffix />
      </PressableRow>
    </RowMenu>
  );
}

function PendingInvitation({ invitation: inv, onSent, onChange }: { invitation: AdminInvitation; onSent: (sent: InvitationSent) => void; onChange: () => void }) {
  const t = usersMessages;
  const toast = useAdminToast();
  const expired = new Date(inv.expiresAt) < new Date();
  const resend = useMutation({
    mutationFn: () => api<InvitationSent>(`/admin/invitations/${encodeURIComponent(inv.id)}/resend`, { method: "POST" }),
    onSuccess: (sent) => {
      onSent(sent);
      onChange();
    },
    onError: (e) => toast.failed(e),
  });
  const revoke = useMutation({
    mutationFn: () => api(`/admin/invitations/${encodeURIComponent(inv.id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.deleted(t.revoked);
      onChange();
    },
    onError: (e) => toast.failed(e),
  });
  const askRevoke = async () => {
    if (await confirmAction({ title: t.revokeTitle(inv.email), description: t.revokeBody, action: t.revoke })) revoke.mutate();
  };
  const busy = resend.isPending || revoke.isPending;
  // A tap: the invitation's actions, in a HeroUI Menu.
  const actions: MenuEntry[] = [
    {
      title: inv.email,
      actions: [
        { label: t.resend, icon: "envelope", disabled: busy, onPress: () => resend.mutate() },
        { label: t.revoke, icon: "trash", destructive: true, disabled: busy, onPress: () => void askRevoke() },
      ],
    },
  ];

  return (
    <TapMenu actions={actions}>
      <ListGroup.Item disabled={busy}>
        <ListGroup.ItemPrefix>
          <MailIcon className="size-6 text-muted" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle numberOfLines={1}>{inv.email}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription numberOfLines={1}>
            {inv.role === "admin" ? t.admin : t.member}
            {expired ? "" : ` · ${t.invitedOn(new Date(inv.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" }))}`}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        {expired && (
          <Chip size="sm" variant="soft" color="danger">
            <Chip.Label>{t.expired}</Chip.Label>
          </Chip>
        )}
        <ListGroup.ItemSuffix />
      </ListGroup.Item>
    </TapMenu>
  );
}
