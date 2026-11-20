import { defineMessages } from "./define";

/** The conversation list: web sidebar and mobile home screen. */
export const conversations = defineMessages({
  en: {
    newConversation: "New conversation",
    empty: "No conversations yet.",
    prefix: (name: string) => `${name}: `,
    justYou: "Just you",
    newDiscussion: "New discussion",
    unread: "Unread",
    marketplace: "Marketplace",
    tasks: "My tasks",
  },
  fr: {
    newConversation: "Nouvelle conversation",
    empty: "Aucune conversation pour le moment.",
    prefix: (name: string) => `${name} : `,
    justYou: "Toi seul",
    newDiscussion: "Nouvelle discussion",
    unread: "Non lu",
    marketplace: "Marketplace",
    tasks: "Mes tâches",
  },
});
