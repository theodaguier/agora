import type { SshTestResult } from "@agora/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { sshHostsQuery } from "@/lib/admin";
import { defineMessages } from "@/lib/i18n";

/* The wording of apps/web/src/components/admin/Machines.tsx, shared by the list and the machine screen. */

export const machinesMessages = defineMessages({
  en: {
    title: "SSH machines",
    text: "Remote machines every bot and code session can reach over SSH. Agora makes a key for each one: add its public key to the machine, then test the connection.",
    listTitle: "Machines",
    add: "Add",
    emptyTitle: "No machines",
    empty: "No machines yet. Add one so agents can work on it.",
    hint: "Touch and hold a machine to test, edit or delete it.",
    untested: "Not tested",
    verified: "Fingerprint pinned",
    usedAgo: (age: string) => `used ${age} ago`,
    allBots: "all bots",
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
    copied: "Copied",
    command: "Command",
    testOk: "Connected",
    fingerprint: (fp: string) => `Host key fingerprint: ${fp}`,
    log: "Recent use",
    logEmpty: "Never used.",
    session: "code session",
    missing: "This machine no longer exists.",
  },
  fr: {
    title: "Machines SSH",
    text: "Les machines distantes que tous les bots et toutes les sessions de code peuvent joindre en SSH. Agora crée une clé pour chacune : ajoute sa clé publique sur la machine, puis teste la connexion.",
    listTitle: "Machines",
    add: "Ajouter",
    emptyTitle: "Aucune machine",
    empty: "Aucune machine pour l'instant. Ajoute-en une pour que les agents puissent y travailler.",
    hint: "Maintiens le doigt sur une machine pour la tester, la modifier ou la supprimer.",
    untested: "Pas encore testée",
    verified: "Empreinte épinglée",
    usedAgo: (age: string) => `utilisée il y a ${age}`,
    allBots: "tous les bots",
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
    copied: "Copié",
    command: "Commande",
    testOk: "Connexion réussie",
    fingerprint: (fp: string) => `Empreinte de la machine : ${fp}`,
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
    onSuccess: (r) => toast.success(t.testOk, t.fingerprint(r.fingerprint)),
    onError: (e) => toast.failed(e, t.test),
    onSettled: () => qc.invalidateQueries({ queryKey: sshHostsQuery.queryKey }),
  });
}
