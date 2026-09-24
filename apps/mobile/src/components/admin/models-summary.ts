import { modelKey, type AdminModels } from "@/lib/admin";
import { defineMessages } from "@/lib/i18n";

export const modelsMessages = defineMessages({
  en: {
    title: "Models",
    text: "Your agents' AI providers, and which models each employee can pick. New models are allowed by default.",
    listFailed: "Hermes couldn't list the models.",
    unreachable: (n: number) => (n === 1 ? "1 agent didn't respond: its models are missing." : `${n} agents didn't respond: their models are missing.`),
    all: "All models",
    none: "No models",
    some: (n: number, total: number) => `${n} of ${total} models`,
    search: "Search for a model…",
    noMatch: "No model matches.",
    allOf: (provider: string) => `All ${provider} models`,
    allowAll: "Allow all models",
    blockAll: "Block all models",
    people: "Employees",
    reasoning: "Reasoning",
    localTitle: "Local models",
    localText: "Models installed on the machine that hosts Agora.",
    notDetected: (url: string) => `Not detected on ${url}`,
    noModels: "Running, no model installed",
    count: (n: number) => (n === 1 ? "Running · 1 model" : `Running · ${n} models`),
    loaded: "Loaded",
    clisTitle: "CLIs",
    clisText: "Agent command-line tools installed on the host machine.",
    checkNow: "Check for updates",
    notInstalled: "Not installed",
    upToDate: "Up to date",
    available: (v: string) => `${v} available`,
    unknownLatest: "Latest version unknown",
    managed: "Updated by the update service",
    manual: "Update it on the machine",
    updating: "Updating…",
    update: "Update",
    failed: "Update failed",
    confirm: (name: string, v: string) => `Update ${name} to ${v}?`,
  },
  fr: {
    title: "Modèles",
    text: "Les fournisseurs d'IA de tes agents, et les modèles que chaque salarié peut choisir. Les nouveaux modèles sont autorisés d'office.",
    listFailed: "Hermes n'a pas pu donner la liste des modèles.",
    unreachable: (n: number) => `${n === 1 ? "Un agent n'a pas répondu" : `${n} agents n'ont pas répondu`} : ses modèles manquent.`,
    all: "Tous les modèles",
    none: "Aucun modèle",
    some: (n: number, total: number) => `${n} modèle${n > 1 ? "s" : ""} sur ${total}`,
    search: "Chercher un modèle…",
    noMatch: "Aucun modèle ne correspond.",
    allOf: (provider: string) => `Tous les modèles ${provider}`,
    allowAll: "Autoriser tous les modèles",
    blockAll: "Bloquer tous les modèles",
    people: "Salariés",
    reasoning: "Raisonnement",
    localTitle: "Modèles locaux",
    localText: "Modèles installés sur la machine qui héberge Agora.",
    notDetected: (url: string) => `Non détecté sur ${url}`,
    noModels: "Actif, aucun modèle installé",
    count: (n: number) => `Actif · ${n} modèle${n > 1 ? "s" : ""}`,
    loaded: "Chargé",
    clisTitle: "CLI",
    clisText: "Outils en ligne de commande des agents, installés sur la machine hôte.",
    checkNow: "Vérifier les mises à jour",
    notInstalled: "Non installée",
    upToDate: "À jour",
    available: (v: string) => `${v} disponible`,
    unknownLatest: "Dernière version inconnue",
    managed: "Mise à jour par le service de mise à jour",
    manual: "À mettre à jour sur la machine",
    updating: "Mise à jour…",
    update: "Mettre à jour",
    failed: "Échec de la mise à jour",
    confirm: (name: string, v: string) => `Mettre à jour ${name} vers ${v} ?`,
  },
});

/** Providers an employee can see: Claude Code only for its owner. */
export const providersFor = (data: AdminModels, userId: string) => data.providers.filter((p) => !p.onlyFor || p.onlyFor === userId);

export function modelsSummary(providers: AdminModels["providers"], blocked: Set<string>) {
  const t = modelsMessages;
  const ids = providers.flatMap((p) => p.models.map((m) => modelKey(p.provider, m.id)));
  const allowed = ids.filter((id) => !blocked.has(id)).length;
  return allowed === 0 ? t.none : allowed === ids.length ? t.all : t.some(allowed, ids.length);
}
