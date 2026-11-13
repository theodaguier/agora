import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SSH_NAME, type SshHostDto, type SshLogEntry, type SshTestResult } from "@agora/core";
import { common } from "@agora/core/i18n";
import { FormLabel } from "@/components/FormLabel";
import { CheckCircleIcon, MoreIcon, RefreshIcon, ServerIcon, TrashIcon } from "@/components/icons";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { AgentTargets } from "@/components/marketplace/AgentTargets";
import { Button } from "@/components/ui/button";
import { CardAction, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Textarea } from "@/components/ui/textarea";
import { defineMessages, useT } from "@/i18n";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { ageLabel } from "@/lib/dates";
import { copyText } from "@/lib/feedback";
import { adminAgentsQuery } from "@/lib/queries";
import { ErrorText, LoadError, Loading, SectionHeader, SettingTile } from "./ui";

const hostsQuery = { queryKey: ["admin", "ssh"], queryFn: () => api<SshHostDto[]>("/admin/ssh") };

const messages = defineMessages({
  en: {
    title: "SSH machines",
    text: "Remote machines every bot and code session can reach over SSH. Agora makes a key for each one: add its public key to the machine, then test the connection.",
    listTitle: "Machines",
    add: "Add",
    empty: "No machines yet. Add one so agents can work on it.",
    untested: "Not tested",
    verified: "Fingerprint pinned",
    usedAgo: (age: string) => `used ${age} ago`,
    allBots: "all bots",
    someBots: (n: number) => `${n} bot${n > 1 ? "s" : ""} left out`,
    edit: "Edit",
    more: (name: string) => `More actions for ${name}`,
    test: "Test the connection",
    testing: "Testing…",
    forget: "Forget the fingerprint",
    forgetTitle: (name: string) => `Forget the fingerprint of ${name}?`,
    forgetText: "Do it only if the machine was reinstalled. Agents can't reach it again until the next successful test pins its new key.",
    forgot: "Fingerprint forgotten.",
    removeTitle: (name: string) => `Delete ${name}?`,
    removeText: "Its key is deleted with it: agents can no longer reach the machine. Remove the key from its authorized_keys too.",
    newTitle: "New machine",
    editTitle: (name: string) => `Edit ${name}`,
    dialogText: "Agents call it by its name: ssh <name>.",
    name: "Name",
    nameHelp: "Lowercase letters, digits and dashes, e.g. prod-web.",
    nameInvalid: "Lowercase letters, digits and dashes only, starting with a letter or digit.",
    host: "Address",
    hostHelp: "Host name or IP address.",
    port: "Port",
    username: "User",
    description: "Purpose",
    descriptionHelp: "Shown to the agents: what runs there, what they may do.",
    bots: "Bots",
    botsHelp: "Unchecked bots can't reach it. Code sessions follow the bot that started them.",
    created: "Machine added.",
    keyTitle: "Public key",
    keyHelp: "Add this line to ~/.ssh/authorized_keys of the user on the machine, or run the command below there.",
    copy: "Copy",
    command: "Command",
    testOk: (fp: string) => `Connected. Host key fingerprint: ${fp}`,
    log: "Recent use",
    logEmpty: "Never used.",
    session: "code session",
    done: "Done",
  },
  fr: {
    title: "Machines SSH",
    text: "Les machines distantes que tous les bots et toutes les sessions de code peuvent joindre en SSH. Agora crée une clé pour chacune : ajoute sa clé publique sur la machine, puis teste la connexion.",
    listTitle: "Machines",
    add: "Ajouter",
    empty: "Aucune machine pour l'instant. Ajoute-en une pour que les agents puissent y travailler.",
    untested: "Pas encore testée",
    verified: "Empreinte épinglée",
    usedAgo: (age: string) => `utilisée il y a ${age}`,
    allBots: "tous les bots",
    someBots: (n: number) => `${n} bot${n > 1 ? "s" : ""} exclu${n > 1 ? "s" : ""}`,
    edit: "Modifier",
    more: (name: string) => `Plus d'actions pour ${name}`,
    test: "Tester la connexion",
    testing: "Test en cours…",
    forget: "Oublier l'empreinte",
    forgetTitle: (name: string) => `Oublier l'empreinte de ${name} ?`,
    forgetText: "Seulement si la machine a été réinstallée. Les agents ne peuvent plus la joindre jusqu'au prochain test réussi, qui épingle sa nouvelle clé.",
    forgot: "Empreinte oubliée.",
    removeTitle: (name: string) => `Supprimer ${name} ?`,
    removeText: "Sa clé est supprimée avec elle : les agents ne peuvent plus joindre la machine. Retire aussi la clé de son authorized_keys.",
    newTitle: "Nouvelle machine",
    editTitle: (name: string) => `Modifier ${name}`,
    dialogText: "Les agents l'appellent par son nom : ssh <nom>.",
    name: "Nom",
    nameHelp: "Minuscules, chiffres et tirets, par exemple prod-web.",
    nameInvalid: "Minuscules, chiffres et tirets uniquement, en commençant par une lettre ou un chiffre.",
    host: "Adresse",
    hostHelp: "Nom d'hôte ou adresse IP.",
    port: "Port",
    username: "Utilisateur",
    description: "Usage",
    descriptionHelp: "Montré aux agents : ce qui y tourne, ce qu'ils peuvent y faire.",
    bots: "Bots",
    botsHelp: "Les bots décochés ne peuvent pas la joindre. Une session de code suit le bot qui l'a lancée.",
    created: "Machine ajoutée.",
    keyTitle: "Clé publique",
    keyHelp: "Ajoute cette ligne au ~/.ssh/authorized_keys de l'utilisateur sur la machine, ou lance la commande ci-dessous sur la machine.",
    copy: "Copier",
    command: "Commande",
    testOk: (fp: string) => `Connexion réussie. Empreinte de la machine : ${fp}`,
    log: "Utilisations récentes",
    logEmpty: "Jamais utilisée.",
    session: "session de code",
    done: "Terminé",
  },
});

const address = (h: Pick<SshHostDto, "username" | "host" | "port">) => `${h.username}@${h.host}${h.port !== 22 ? `:${h.port}` : ""}`;

/** Settings › Machines: the SSH machines of the instance (apps/api ssh.ts). */
export function Machines() {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data: hosts, isPending, error } = useQuery(hostsQuery);
  // null: closed; "": new machine; otherwise the id of the machine being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: hostsQuery.queryKey });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/ssh/${id}`, { method: "DELETE" }),
    onSettled: invalidate,
    meta: { success: c.deleted },
  });
  const forget = useMutation({
    mutationFn: (id: string) => api(`/admin/ssh/${id}/forget-host-key`, { method: "POST" }),
    onSettled: invalidate,
    meta: { success: t.forgot },
  });
  const test = useTest();

  const summary = (h: SshHostDto) =>
    [
      address(h),
      h.hostKeyFingerprint ? t.verified : t.untested,
      h.excludedAgentIds.length ? t.someBots(h.excludedAgentIds.length) : t.allBots,
      h.lastUsedAt && t.usedAgo(ageLabel(new Date(h.lastUsedAt))),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <SectionHeader title={t.title} text={t.text} />
      <ListCard>
        <ListCardHeader>
          <CardTitle>{t.listTitle}</CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing("")}>
              {t.add}
            </Button>
          </CardAction>
        </ListCardHeader>
        {isPending ? (
          <CardContent className="py-(--card-spacing)">
            <Loading />
          </CardContent>
        ) : error ? (
          <CardContent className="py-(--card-spacing)">
            <LoadError error={error} />
          </CardContent>
        ) : hosts?.length ? (
          <ListCardRows>
            {hosts.map((h) => (
              <Item size="xs" key={h.id}>
                <SettingTile>
                  <ServerIcon />
                </SettingTile>
                <ItemContent className="min-w-0">
                  <ItemTitle>{h.name}</ItemTitle>
                  <ItemDescription className="truncate">{summary(h)}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm" onClick={() => setEditing(h.id)}>
                    {t.edit}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.more(h.name)} />}>
                      <MoreIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => test.mutate(h.id)}>
                        <CheckCircleIcon />
                        {t.test}
                      </DropdownMenuItem>
                      {h.hostKeyFingerprint && (
                        <DropdownMenuItem
                          onClick={async () => (await confirmAction({ title: t.forgetTitle(h.name), description: t.forgetText, action: t.forget })) && forget.mutate(h.id)}
                        >
                          <RefreshIcon />
                          {t.forget}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={async () => (await confirmAction({ title: t.removeTitle(h.name), description: t.removeText, action: c.delete })) && remove.mutate(h.id)}
                      >
                        <TrashIcon />
                        {c.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ItemActions>
              </Item>
            ))}
          </ListCardRows>
        ) : (
          <CardContent className="py-(--card-spacing)">
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          </CardContent>
        )}
      </ListCard>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null && (
          <MachineDialog
            key={editing}
            host={hosts?.find((h) => h.id === editing)}
            onCreated={(h) => setEditing(h.id)}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}

/** Tests a machine; the toast says how it went (the first success pins its host key). */
function useTest() {
  const t = useT(messages);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await api<SshTestResult>(`/admin/ssh/${id}/test`, { method: "POST" });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: hostsQuery.queryKey }),
    meta: { loading: t.testing, success: (r: SshTestResult) => (r.ok ? t.testOk(r.fingerprint) : undefined) },
  });
}

function MachineDialog({ host, onCreated, onClose }: { host?: SshHostDto; onCreated: (h: SshHostDto) => void; onClose: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const [name, setName] = useState(host?.name ?? "");
  const [hostname, setHostname] = useState(host?.host ?? "");
  const [port, setPort] = useState(String(host?.port ?? 22));
  const [username, setUsername] = useState(host?.username ?? "");
  const [description, setDescription] = useState(host?.description ?? "");
  // Kept as the bots left out: every other bot, including one made later, reaches it.
  const [excluded, setExcluded] = useState<string[]>(host?.excludedAgentIds ?? []);
  const allowed = agents.filter((a) => !excluded.includes(a.id)).map((a) => a.id);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        host: hostname.trim(),
        port: Number(port),
        username: username.trim(),
        description,
        excludedAgentIds: excluded,
      };
      return host
        ? api<SshHostDto>(`/admin/ssh/${host.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api<SshHostDto>("/admin/ssh", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: hostsQuery.queryKey });
      // A new machine stays open on its key: it must be added to the machine before the test.
      if (host) onClose();
      else onCreated(saved);
    },
    meta: { success: host ? c.saved : t.created, error: false },
  });

  const nameError = name && !SSH_NAME.test(name) ? t.nameInvalid : null;
  const portNumber = Number(port);
  const valid = !!name && !nameError && !!hostname.trim() && !!username.trim() && Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536;

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{host ? t.editTitle(host.name) : t.newTitle}</DialogTitle>
        <DialogDescription>{t.dialogText}</DialogDescription>
      </DialogHeader>
      <form
        id="ssh-machine"
        className="max-h-[65vh] overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <FieldGroup>
          {host && <PublicKey host={host} />}
          <Field data-invalid={!!nameError}>
            <FormLabel htmlFor="ssh-name" required>
              {t.name}
            </FormLabel>
            <Input
              id="ssh-name"
              autoComplete="off"
              spellCheck={false}
              autoFocus={!host}
              aria-invalid={!!nameError}
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
            />
            <FieldDescription>{nameError ?? t.nameHelp}</FieldDescription>
          </Field>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field>
              <FormLabel htmlFor="ssh-host" required>
                {t.host}
              </FormLabel>
              <Input id="ssh-host" autoComplete="off" spellCheck={false} value={hostname} onChange={(e) => setHostname(e.target.value)} />
              <FieldDescription>{t.hostHelp}</FieldDescription>
            </Field>
            <Field>
              <FormLabel htmlFor="ssh-port" required>
                {t.port}
              </FormLabel>
              <Input id="ssh-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <Field>
            <FormLabel htmlFor="ssh-user" required>
              {t.username}
            </FormLabel>
            <Input id="ssh-user" autoComplete="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field>
            <FormLabel htmlFor="ssh-description">{t.description}</FormLabel>
            <Textarea id="ssh-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            <FieldDescription>{t.descriptionHelp}</FieldDescription>
          </Field>
          {agents.length > 0 && <AgentTargets legend={t.bots} hint={t.botsHelp} value={allowed} onChange={(ids) => setExcluded(agents.filter((a) => !ids.includes(a.id)).map((a) => a.id))} />}
          {host && <UsageLog host={host} />}
          <ErrorText error={save.error} />
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="ssh-machine" disabled={!valid || save.isPending}>
          {save.isPending ? c.saving : host ? c.save : c.create}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** The key to add on the machine, and the test that pins its fingerprint. */
function PublicKey({ host }: { host: SshHostDto }) {
  const t = useT(messages);
  const test = useTest();
  const command = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${host.publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
  return (
    <FieldSet>
      <FieldLegend variant="label">{t.keyTitle}</FieldLegend>
      <FieldDescription>{t.keyHelp}</FieldDescription>
      <InputGroup>
        <InputGroupInput readOnly aria-label={t.keyTitle} value={host.publicKey} className="font-mono text-xs" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="sm" onClick={() => copyText(host.publicKey)}>
            {t.copy}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput readOnly aria-label={t.command} value={command} className="font-mono text-xs" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="sm" onClick={() => copyText(command)}>
            {t.copy}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate(host.id)}>
          {test.isPending ? t.testing : t.test}
        </Button>
        {host.hostKeyFingerprint && <span className="truncate font-mono text-xs text-muted-foreground">{host.hostKeyFingerprint}</span>}
      </div>
    </FieldSet>
  );
}

function UsageLog({ host }: { host: SshHostDto }) {
  const t = useT(messages);
  const { data: entries, isPending } = useQuery({ queryKey: ["admin", "ssh", host.id, "log"], queryFn: () => api<SshLogEntry[]>(`/admin/ssh/${host.id}/log`) });
  return (
    <FieldSet>
      <FieldLegend variant="label">{t.log}</FieldLegend>
      {isPending ? (
        <Loading />
      ) : !entries?.length ? (
        <FieldDescription>{t.logEmpty}</FieldDescription>
      ) : (
        <ItemGroup>
          {entries.map((e) => (
            <Item size="xs" key={e.id} className="px-0">
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full truncate font-mono text-xs">{e.command ?? t.session}</ItemTitle>
                <ItemDescription className="truncate">
                  {[e.agentName, e.userName, ageLabel(new Date(e.at)), e.exitCode !== null && e.exitCode !== 0 && `exit ${e.exitCode}`].filter(Boolean).join(" · ")}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </FieldSet>
  );
}
