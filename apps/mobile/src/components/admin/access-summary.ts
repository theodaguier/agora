import { type AdminAgent, type AdminUser } from "@/lib/admin";
import { defineMessages } from "@/lib/i18n";

export const accessMessages = defineMessages({
  en: {
    title: "Access",
    text: "Which agents each employee can use.",
    all: "All agents",
    none: "No agents",
    some: (n: number, total: number) => `${n} of ${total} agents`,
    search: "Search for an agent…",
    searchPeople: "Search for someone…",
    noMatch: "No agent matches.",
    agents: "Agents",
    people: "People",
    allOn: "Open all agents",
    allOff: "Remove all agents",
    everyone: "Everyone",
    nobody: "Nobody",
    somePeople: (n: number, total: number) => `${n} of ${total} people`,
    allPeopleOn: "Open to everyone",
    allPeopleOff: "Remove everyone",
    noAgents: "No agents yet.",
  },
  fr: {
    title: "Accès",
    text: "Quels agents chaque salarié peut utiliser.",
    all: "Tous les agents",
    none: "Aucun agent",
    some: (n: number, total: number) => `${n} agent${n > 1 ? "s" : ""} sur ${total}`,
    search: "Chercher un agent…",
    searchPeople: "Chercher quelqu'un…",
    noMatch: "Aucun agent ne correspond.",
    agents: "Agents",
    people: "Personnes",
    allOn: "Ouvrir tous les agents",
    allOff: "Retirer tous les agents",
    everyone: "Tout le monde",
    nobody: "Personne",
    somePeople: (n: number, total: number) => `${n} personne${n > 1 ? "s" : ""} sur ${total}`,
    allPeopleOn: "Ouvrir à tout le monde",
    allPeopleOff: "Retirer tout le monde",
    noAgents: "Aucun agent pour l'instant.",
  },
});

export const agentSpec = (a: AdminAgent) => ({ avatar: { shape: a.avatarShape, color: a.avatarColor } });

/** Summary of one employee's agents; only agents that still exist count. */
export function accessSummary(user: AdminUser, agents: AdminAgent[]) {
  const t = accessMessages;
  const granted = new Set(user.agents);
  const n = agents.filter((a) => granted.has(a.id)).length;
  return n === 0 ? t.none : n === agents.length ? t.all : t.some(n, agents.length);
}
