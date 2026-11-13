import { defineMessages } from "./define";

/** Messages written while an agent works, waiting above the composer (a conversation's bot, a code session). */
export const queue = defineMessages({
  en: {
    title: "Queued",
    edit: "Edit",
    sendNow: "Send now",
    remove: "Remove",
    files: (n: number) => (n === 1 ? "1 file" : `${n} files`),
  },
  fr: {
    title: "En file d'attente",
    edit: "Modifier",
    sendNow: "Envoyer maintenant",
    remove: "Retirer",
    files: (n: number) => (n === 1 ? "1 fichier" : `${n} fichiers`),
  },
});
