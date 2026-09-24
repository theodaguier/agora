import { defineMessages } from "@/lib/i18n";
import { type WikiNodeType } from "@/lib/memory";

export const wikiMessages = defineMessages<{
  legend: Record<WikiNodeType, string>;
  type: Record<WikiNodeType, string>;
  updated: (date: string) => string;
  ghost: string;
  agent: string;
  linked: (n: number) => string;
}>({
  en: {
    legend: {
      agent: "Agents",
      entity: "Entities",
      concept: "Concepts",
      comparison: "Comparisons",
      query: "Questions",
      session: "Sessions",
      raw: "Raw sources",
      ghost: "Links without a page",
    },
    type: {
      agent: "Agent",
      entity: "Entity",
      concept: "Concept",
      comparison: "Comparison",
      query: "Question",
      session: "Daily log",
      raw: "Raw source",
      ghost: "Page to create",
    },
    updated: (date) => `· updated ${date}`,
    ghost: "This page is referenced but doesn't exist yet. The curator will create it when the topic comes up again.",
    agent: "Pages and conversations linked to this agent.",
    linked: (n) => (n === 1 ? "Linked to 1 page" : `Linked to ${n} pages`),
  },
  fr: {
    legend: {
      agent: "Agents",
      entity: "Entités",
      concept: "Concepts",
      comparison: "Comparaisons",
      query: "Questions",
      session: "Sessions",
      raw: "Sources brutes",
      ghost: "Liens sans page",
    },
    type: {
      agent: "Agent",
      entity: "Entité",
      concept: "Concept",
      comparison: "Comparaison",
      query: "Question",
      session: "Journal du jour",
      raw: "Source brute",
      ghost: "Page à créer",
    },
    updated: (date) => `· mis à jour le ${date}`,
    ghost: "Cette page est citée mais n'existe pas encore. Le curateur la créera quand le sujet reviendra.",
    agent: "Les pages et conversations reliées à cet agent.",
    linked: (n) => `Liée à ${n} page${n > 1 ? "s" : ""}`,
  },
});
