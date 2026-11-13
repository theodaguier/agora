import type { SshProbe, SshTestResult } from "@agora/core";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { sshHostsQuery } from "@/lib/admin";
import { defineMessages } from "@/lib/i18n";

/* The wording of apps/web/src/components/admin/Machines.tsx, shared by the list and the machine screen. */

export const machinesMessages = defineMessages({
  en: {
    title: "SSH machines",
    text: "Remote machines every bot and code session can reach over SSH. Agora makes a key for each one: run its command on the machine, then test the connection.",
    listTitle: "Machines",
    add: "Add",
    emptyTitle: "No machines",
    empty: "No machines yet. Add one so agents can work on it.",
    hint: "Touch and hold a machine to test, edit or delete it.",
    untested: "Not tested",
    connected: "Connection verified",
    online: "Online",
    offline: "Offline",
    checking: "Checking…",
    latency: (ms: number) => `${ms} ms`,
    failed: (code: number) => `failed (code ${code})`,
    usedAgo: (age: string) => `used ${age} ago`,
    someBots: (n: number) => `${n} bot${n > 1 ? "s" : ""} left out`,
    edit: "Edit",
    test: "Test the connection",
    testing: "Testing…",
    forget: "Forget the fingerprint",
    forgetTitle: (name: string) => `Forget the fingerprint of ${name}?`,
    forgetText: "Do it only if the machine was reinstalled. Agents can't reach it again until the next successful test pins its new key.",
    forgot: "Fingerprint forgotten.",
    removeTitle: (name: string) => `Delete ${name}?`,
    removeText: "Its key is deleted with it: agents can no longer reach the machine. Remove the key from its authorized_keys too.",
    newTitle: "New machine",
    dialogText: "Agents reach it by its name.",
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
    keyTitle: "Access key",
    keyHelp: "Run this command on the machine, signed in as its user, then test the connection.",
    copy: "Copy",
    copied: "Copied",
    command: "Command",
    testOk: "Connected.",
    log: "Recent use",
    logEmpty: "Never used.",
    session: "code session",
    missing: "This machine no longer exists.",
  },
  fr: {
    title: "Machines SSH",
    text: "Les machines distantes que tous les bots et toutes les sessions de code peuvent joindre en SSH. Agora crée une clé pour chacune : lance sa commande sur la machine, puis teste la connexion.",
    listTitle: "Machines",
    add: "Ajouter",
    emptyTitle: "Aucune machine",
    empty: "Aucune machine pour l'instant. Ajoute-en une pour que les agents puissent y travailler.",
    hint: "Maintiens le doigt sur une machine pour la tester, la modifier ou la supprimer.",
    untested: "Pas encore testée",
    connected: "Connexion vérifiée",
    online: "En ligne",
    offline: "Hors ligne",
    checking: "Vérification…",
    latency: (ms: number) => `${ms} ms`,
    failed: (code: number) => `échec (code ${code})`,
    usedAgo: (age: string) => `utilisée il y a ${age}`,
    someBots: (n: number) => `${n} bot${n > 1 ? "s" : ""} exclu${n > 1 ? "s" : ""}`,
    edit: "Modifier",
    test: "Tester la connexion",
    testing: "Test en cours…",
    forget: "Oublier l'empreinte",
    forgetTitle: (name: string) => `Oublier l'empreinte de ${name} ?`,
    forgetText: "Seulement si la machine a été réinstallée. Les agents ne peuvent plus la joindre jusqu'au prochain test réussi, qui épingle sa nouvelle clé.",
    forgot: "Empreinte oubliée.",
    removeTitle: (name: string) => `Supprimer ${name} ?`,
    removeText: "Sa clé est supprimée avec elle : les agents ne peuvent plus joindre la machine. Retire aussi la clé de son authorized_keys.",
    newTitle: "Nouvelle machine",
    dialogText: "Les agents la joignent par son nom.",
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
    keyTitle: "Clé d'accès",
    keyHelp: "Lance cette commande sur la machine, connecté en tant que son utilisateur, puis teste la connexion.",
    copy: "Copier",
    copied: "Copié",
    command: "Commande",
    testOk: "Connexion réussie.",
    log: "Utilisations récentes",
    logEmpty: "Jamais utilisée.",
    session: "session de code",
    missing: "Cette machine n'existe plus.",
  },
});

/** The machine screen of a host ("new" for a new one). */
export const machineHref = (id = "new") => `/profile/admin/machines/${encodeURIComponent(id)}` as const;

/** Tests a machine; the toast says how it went (the first success pins its host key). */
export function useTestMachine() {
  const t = machinesMessages;
  const qc = useQueryClient();
  const toast = useAdminToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await api<SshTestResult>(`/admin/ssh/${encodeURIComponent(id)}/test`, { method: "POST" });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: () => toast.success(t.testOk),
    onError: (e) => toast.failed(e, t.test),
    onSettled: () => qc.invalidateQueries({ queryKey: sshHostsQuery.queryKey }),
  });
}

/** Whether each saved machine answers right now (the web's statusQuery), every 30 s while shown. */
export const sshStatusQuery = queryOptions({
  queryKey: ["admin", "ssh", "status"],
  queryFn: () => api<Record<string, SshProbe>>("/admin/ssh/status"),
  refetchInterval: 30_000,
});

const probeErrors = defineMessages({
  en: {} as Record<string, string>,
  fr: {
    "Invalid address.": "Adresse invalide.",
    "Unknown host name.": "Nom d'hôte inconnu.",
    "Connection refused on this port.": "Connexion refusée sur ce port.",
    "The server didn't answer in time.": "Le serveur n'a pas répondu à temps.",
    "The server answered but isn't an SSH server.": "Le serveur répond, mais ce n'est pas un serveur SSH.",
    "The server closed the connection.": "Le serveur a fermé la connexion.",
  } as Record<string, string>,
});

/** A machine's live state, as the web's ServerStatus: its word, its colour class, and why it is offline. */
export function probeState(probe: SshProbe | undefined) {
  const t = machinesMessages;
  if (!probe) return { label: t.checking, className: "text-muted", detail: undefined };
  if (probe.online) return { label: `${t.online}, ${t.latency(probe.latencyMs)}`, className: "text-success", detail: undefined };
  return { label: t.offline, className: "text-danger", detail: probeErrors[probe.error] ?? probe.error };
}
