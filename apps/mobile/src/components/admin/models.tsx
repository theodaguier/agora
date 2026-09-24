import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Chip, ListGroup } from "heroui-native";
import { View } from "react-native";
import { confirmAction } from "@/components/confirm-action";
import { ErrorAlert, LoadingRows, Section, useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { hostClisQuery, hostModelsQuery, providerName, type HostCli } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { locale, tr } from "@/lib/i18n";
import { numberFormat } from "@/lib/intl";
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
