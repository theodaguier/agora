import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Card, Description, Input, Label, ListGroup, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AdminGate, ErrorAlert, LoadingRows, PressableRow, Section, SectionTitle, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { AccessChoice } from "@/components/admin/users";
import { confirmAction } from "@/components/confirm-action";
import { usersMessages } from "@/components/admin/users-messages";
import { PersonAvatar } from "@/components/conversation-avatar";
import { useMe } from "@/components/server-scope";
import { api } from "@/lib/api";
import { adminAgentsQuery, adminUsersQuery, type AdminUser } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";

/* apps/web/src/components/admin/Users.tsx `UserRow`, as a detail screen. */

const messages = defineMessages({
  en: {
    agents: "Agents",
    models: "Models",
    availability: "Availability",
    all: "All agents",
    none: "No agents",
    some: (n: number, total: number) => `${n} of ${total} agents`,
    remove: "Delete",
    removeTitle: (name: string) => `Delete ${name}'s account?`,
    removeBody:
      "They are signed out everywhere and lose access to the app. Their messages, tasks and conversations stay, without their name. This can't be undone, but you can invite them again.",
  },
  fr: {
    agents: "Agents",
    models: "Modèles",
    availability: "Disponibilité",
    all: "Tous les agents",
    none: "Aucun agent",
    some: (n: number, total: number) => `${n} agent${n > 1 ? "s" : ""} sur ${total}`,
    remove: "Supprimer",
    removeTitle: (name: string) => `Supprimer le compte de ${name} ?`,
    removeBody:
      "Ses sessions sont fermées partout et l'app ne lui est plus accessible. Ses messages, tâches et conversations restent, sans son nom. C'est définitif, mais tu pourras l'inviter à nouveau.",
  },
});

export default function UserScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data: users, error } = useQuery(adminUsersQuery);
  const user = users?.find((u) => u.id === userId);
  return (
    <>
      <Stack.Screen.Title>{user?.name ?? ""}</Stack.Screen.Title>
      <AdminGate>
        {user ? (
          <UserDetail user={user} />
        ) : (
          <SettingsScroll>{error ? <ErrorAlert error={error} /> : <LoadingRows rows={2} />}</SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function UserDetail({ user: u }: { user: AdminUser }) {
  const t = { ...usersMessages, ...messages };
  const qc = useQueryClient();
  const toast = useAdminToast();
  const me = useMe().id;
  const agents = useQuery(adminAgentsQuery).data ?? [];
  const [title, setTitle] = useState(u.title);
  const [savedTitle, setSavedTitle] = useState(u.title);
  if (u.title !== savedTitle) {
    setSavedTitle(u.title);
    setTitle(u.title);
  }
  const update = useMutation({
    mutationFn: (patch: { role?: string; title?: string }) => api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (_, patch) => patch.title !== undefined && toast.success(tr(common).saved),
    onSettled: () => qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }),
    onError: (e) => {
      setTitle(u.title);
      toast.failed(e);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.deleted();
      router.back();
      await qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey });
    },
    onError: (e) => toast.failed(e),
  });
  const saveTitle = () => {
    const next = title.trim();
    if (!next) return setTitle(u.title);
    if (next !== u.title) update.mutate({ title: next });
  };
  // Only agents that still exist count.
  const granted = new Set(u.agents);
  const mine = agents.filter((a) => granted.has(a.id)).length;
  const summary = mine === 0 ? t.none : mine === agents.length ? t.all : t.some(mine, agents.length);

  return (
    <SettingsScroll>
      <View className="items-center gap-1">
        <PersonAvatar person={u} className="size-20" />
        <Typography.Heading type="h3" className="mt-2">
          {u.name}
        </Typography.Heading>
        <Typography.Paragraph type="body-sm" color="muted" selectable>
          {[u.username ? `@${u.username}` : null, u.email].filter(Boolean).join(" · ")}
        </Typography.Paragraph>
      </View>

      <TextField>
        <Label>{t.roleTitle}</Label>
        <Input value={title} maxLength={60} placeholder={t.addRole} onChangeText={setTitle} onBlur={saveTitle} onSubmitEditing={saveTitle} returnKeyType="done" />
      </TextField>

      <View className="gap-2">
        <SectionTitle>{t.access}</SectionTitle>
        <Card>
          <Card.Body>
            <AccessChoice value={u.role === "admin" ? "admin" : "user"} disabled={u.id === me || update.isPending} onChange={(role) => update.mutate({ role })} />
          </Card.Body>
        </Card>
        {u.id === me && <Description className="px-4">{t.ownAccess}</Description>}
      </View>

      <Section>
        <Link href={{ pathname: "/profile/admin/access/user/[userId]", params: { userId: u.id } }} asChild>
          <PressableRow>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{t.agents}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription>{summary}</ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableRow>
        </Link>
        <Link href={{ pathname: "/profile/admin/models/[userId]", params: { userId: u.id } }} asChild>
          <PressableRow>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{t.models}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableRow>
        </Link>
        {/* Working hours, absences and "do not disturb" (the web's Users.tsx availability dialog). */}
        <Link href={{ pathname: "/profile/availability", params: u.id === me ? {} : { userId: u.id } }} asChild>
          <PressableRow>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{t.availability}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableRow>
        </Link>
      </Section>

      {u.id !== me && (
        <Button
          variant="danger-soft"
          size="lg"
          isDisabled={remove.isPending}
          onPress={withTap(async () => (await confirmAction({ title: t.removeTitle(u.name), description: t.removeBody, action: t.remove })) && remove.mutate())}
        >
          {t.remove}
        </Button>
      )}
    </SettingsScroll>
  );
}
