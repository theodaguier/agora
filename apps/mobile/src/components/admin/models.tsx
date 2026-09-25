import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Button, Chip, ListGroup } from "heroui-native";
import { View } from "react-native";
import { confirmAction } from "@/components/confirm-action";
import { ErrorAlert, LoadingRows, PressableRow, RowMenu, Section, useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { adminModelsQuery, hostClisQuery, hostModelsQuery, providerName, subscriptionAccountsQuery, type HostCli, type SubscriptionAccounts, type SubscriptionEngine } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { locale, tr } from "@/lib/i18n";
import { dateFormat, numberFormat } from "@/lib/intl";
import { modelsMessages } from "@/components/admin/models-summary";

/* apps/web/src/components/admin/Models.tsx and HostModels.tsx: shared parts of the models screens. */

export function LocalModels() {
  const t = modelsMessages;
  const { data, error } = useQuery({ ...hostModelsQuery, refetchInterval: 30_000 });
  const gb = numberFormat(locale, { maximumFractionDigits: 1 });
  if (!data) return error ? <ErrorAlert error={error} /> : <LoadingRows rows={2} avatar={false} />;
  return (
    <>
      {data.runtimes.map((r, i) => (
        <Section key={r.id} title={i === 0 ? t.localTitle : undefined} help={i === 0 ? t.localText : undefined}>
          <ListGroup.Item disabled>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{providerName(r.id)}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>
                {!r.running ? t.notDetected(r.url) : r.models.length ? t.count(r.models.length) : t.noModels}
              </ListGroup.ItemDescription>
            </ListGroup.ItemContent>
          </ListGroup.Item>
          {r.models.map((m) => (
            <ListGroup.Item key={m.id} disabled>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{m.id}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription numberOfLines={1}>
                  {[m.parameters, m.quantization, m.size ? `${gb.format(m.size / 1e9)} GB` : undefined].filter(Boolean).join(" · ")}
                </ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              {m.loaded && (
                <ListGroup.ItemSuffix>
                  <Chip size="sm" variant="soft" color="accent">
                    <Chip.Label>{t.loaded}</Chip.Label>
                  </Chip>
                </ListGroup.ItemSuffix>
              )}
            </ListGroup.Item>
          ))}
        </Section>
      ))}
    </>
  );
}

export function HostClis() {
  const t = modelsMessages;
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data, error } = useQuery({
    ...hostClisQuery,
    // Follows an update in progress.
    refetchInterval: (q) => (q.state.data?.clis.some((cli) => cli.job && !cli.job.endedAt) ? 2000 : false),
  });
  const check = useMutation({
    mutationFn: () => api<{ clis: HostCli[] }>("/admin/host/clis/check", { method: "POST" }),
    onSuccess: (d) => qc.setQueryData(hostClisQuery.queryKey, d),
    onError: (e) => toast.failed(e),
  });
  const update = useMutation({
    mutationFn: (id: string) => api(`/admin/host/clis/${id}/update`, { method: "POST" }),
    onError: (e) => toast.failed(e, t.failed),
    onSettled: () => qc.invalidateQueries({ queryKey: hostClisQuery.queryKey }),
  });

  if (!data) return error ? <ErrorAlert error={error} /> : <LoadingRows rows={3} avatar={false} />;
  return (
    <>
      <Section
        title={t.clisTitle}
        help={t.clisText}
        action={
          <Button size="sm" variant="ghost" isDisabled={check.isPending} onPress={withTap(() => check.mutate())}>
            {check.isPending ? c.inProgress : t.checkNow}
          </Button>
        }
 >
        {data.clis.map((cli) => (
          <CliRow
            key={cli.id}
            cli={cli}
            onUpdate={async () =>
              (await confirmAction({ title: t.confirm(cli.name, cli.latest!), action: t.update, destructive: false })) && update.mutate(cli.id)
            }
 />
        ))}
      </Section>
    </>
  );
}

function CliRow({ cli, onUpdate }: { cli: HostCli; onUpdate: () => void }) {
  const t = modelsMessages;
  const running = !!cli.job && !cli.job.endedAt;
  const failed = !!cli.job?.endedAt && !cli.job.ok;
  // The state in a Chip; the description keeps the version and what to do.
  const [status, color]: [string, "default" | "accent" | "danger" | "warning" | "success"] = !cli.installed
    ? [t.notInstalled, "default"]
    : running
      ? [t.updating, "accent"]
      : failed
        ? [t.failed, "danger"]
        : !cli.latest
          ? [t.unknownLatest, "default"]
          : cli.outdated
            ? [t.available(cli.latest), "warning"]
            : [t.upToDate, "success"];
  const detail = failed
    ? cli.job?.output
    : cli.installed && cli.outdated && !running
      ? cli.update === "managed"
        ? t.managed
        : cli.update === "manual"
          ? t.manual
          : null
      : null;
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{cli.name}</ListGroup.ItemTitle>
        {(!!cli.version || !!detail) && (
          <ListGroup.ItemDescription selectable={failed} numberOfLines={failed ? 4 : 2}>
            {[cli.version, detail].filter(Boolean).join(" · ")}
          </ListGroup.ItemDescription>
        )}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <View className="items-end gap-2">
          <Chip size="sm" variant="soft" color={color}>
            <Chip.Label>{status}</Chip.Label>
          </Chip>
          {cli.installed && cli.outdated && cli.update === "self" && (
            <Button size="sm" isDisabled={running} onPress={withTap(onUpdate)}>
              {running ? t.updating : t.update}
            </Button>
          )}
        </View>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/** The engines whose accounts are managed here, as the web's ENGINES (HostModels.tsx). */
export const ENGINES: Record<SubscriptionEngine, { name: string; account: string }> = {
  claude: { name: "Claude Code", account: "Claude" },
  codex: { name: "Codex", account: "ChatGPT" },
};

/** The sheet that signs an account in: the code to paste back (Claude), the device code (Codex). */
export const accountSheetHref = (engine: SubscriptionEngine) => `/profile/admin/models/${engine}-account` as Href;

/** After an account change: its plan decides the models, the pickers and the status follow. */
export const accountsSaved = (qc: QueryClient, engine: SubscriptionEngine, data: SubscriptionAccounts) => {
  qc.setQueryData(subscriptionAccountsQuery(engine).queryKey, data);
  return Promise.all([
    qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }),
    qc.invalidateQueries({ queryKey: ["models"] }),
    qc.invalidateQueries({ queryKey: ["admin", "status"] }),
  ]);
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** SubscriptionAccountRows of apps/web/src/components/admin/HostModels.tsx: shown to the engine's owner only. */
export function SubscriptionAccountsSection({ engine }: { engine: SubscriptionEngine }) {
  const t = modelsMessages;
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const { name, account } = ENGINES[engine];
  const { data } = useQuery(subscriptionAccountsQuery(engine));
  const activate = useMutation({
    mutationFn: (id: string | null) => api<SubscriptionAccounts>(`/admin/host/${engine}/active`, { method: "PUT", body: JSON.stringify({ id }) }),
    onSuccess: (d) => accountsSaved(qc, engine, d),
    onError: (e) => toast.failed(e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<SubscriptionAccounts>(`/admin/host/${engine}/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: (d) => (toast.success(t.removed), accountsSaved(qc, engine, d)),
    onError: (e) => toast.failed(e),
  });
  if (!data) return null;

  const day = dateFormat(locale, { dateStyle: "medium" });
  const { machine } = data;
  const rows = [
    {
      id: null,
      title: t.machine,
      description: machine.loggedIn ? [machine.email, machine.plan && capitalize(machine.plan)].filter(Boolean).join(" · ") || t.signedIn : t.notSignedIn,
    },
    ...data.accounts.map((a) => ({
      id: a.id,
      title: a.email,
      description: a.loggedIn ? [a.plan && capitalize(a.plan), t.added(day.format(new Date(a.addedAt)))].filter(Boolean).join(" · ") : t.signedOut,
    })),
  ];

  return (
    <Section
      title={t.accountsTitle(account)}
      help={t.accountsText(name)}
      action={
        <Button size="sm" variant="ghost" onPress={withTap(() => router.push(accountSheetHref(engine)))}>
          {t.add}
        </Button>
      }
    >
      {rows.map((r) => {
        const active = data.active === r.id;
        const content = (
          <>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle numberOfLines={1}>{r.title}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>{r.description}</ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            {active && (
              <ListGroup.ItemSuffix>
                <Chip size="sm" variant="soft" color="success">
                  <Chip.Label>{t.inUse}</Chip.Label>
                </Chip>
              </ListGroup.ItemSuffix>
            )}
          </>
        );
        const actions = [
          ...(active ? [] : [{ label: t.use, icon: "checkmark.circle" as const, disabled: activate.isPending, onPress: () => activate.mutate(r.id) }]),
          ...(r.id
            ? [
                {
                  label: t.remove,
                  icon: "trash" as const,
                  destructive: true,
                  disabled: remove.isPending,
                  onPress: async () => {
                    if (await confirmAction({ title: t.removeTitle(r.title), description: active ? t.removeActiveText(name) : t.removeText, action: t.remove })) remove.mutate(r.id!);
                  },
                },
              ]
            : []),
        ];
        return actions.length ? (
          <RowMenu key={r.id ?? "machine"} openOnPress actions={actions}>
            <PressableRow>{content}</PressableRow>
          </RowMenu>
        ) : (
          <ListGroup.Item key="machine" disabled>
            {content}
          </ListGroup.Item>
        );
      })}
    </Section>
  );
}
