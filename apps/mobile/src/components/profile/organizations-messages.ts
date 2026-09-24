import { defineMessages } from "@/lib/i18n";

export const organizationsMessages = defineMessages({
  en: {
    organizations: "Organizations",
    current: "Current",
    add: "Add an organization",
    switchTo: (org: string) => `Switch to ${org}`,
    signOutTitle: (org: string) => `Sign out of ${org}?`,
    signOutHelp: "You'll have to sign in again to use this organization on this phone.",
    help: "The Agora spaces this phone is signed in to. Each keeps its own session.",
  },
  fr: {
    organizations: "Organisations",
    current: "Actuelle",
    add: "Ajouter une organisation",
    switchTo: (org: string) => `Passer à ${org}`,
    signOutTitle: (org: string) => `Se déconnecter de ${org} ?`,
    signOutHelp: "Il faudra te reconnecter pour utiliser cette organisation sur ce téléphone.",
    help: "Les espaces Agora auxquels ce téléphone est connecté. Chacun garde sa propre session.",
  },
});
