import { defineMessages } from "./define";

/** Reconfiguring an installed MCP connector (Marketplace › Installed): web and mobile. */
export const connectors = defineMessages({
  en: {
    reconfigure: "Reconfigure",
    reconfigureName: (name: string) => `Reconfigure ${name}`,
    reconfigureIntro: "Enter new secrets or authorize again. The connector is tested before it replaces the current one.",
    auth: "Authentication",
    auths: { none: "None", header: "Access token", oauth: "OAuth" } as Record<"none" | "header" | "oauth", string>,
    token: "Access token",
    keepEmpty: "A field left empty keeps its current value.",
    noFields: "This connector has no secrets to enter: saving declares it again and tests the connection.",
    remoteNoFiles: "Only how Hermes signs in to the server. The server's own credentials (a Google service-account key…) are set where it's hosted, not here.",
    secretsNote: "Sent straight to Hermes: the app's database never keeps them.",
    authorize: "Authorize",
    reconfigured: (name: string) => `“${name}” reconfigured.`,
  },
  fr: {
    reconfigure: "Reconfigurer",
    reconfigureName: (name: string) => `Reconfigurer ${name}`,
    reconfigureIntro: "Saisis de nouveaux secrets ou autorise à nouveau. Le connecteur est testé avant de remplacer l'actuel.",
    auth: "Authentification",
    auths: { none: "Aucune", header: "Jeton d'accès", oauth: "OAuth" },
    token: "Jeton d'accès",
    keepEmpty: "Un champ laissé vide garde sa valeur actuelle.",
    noFields: "Ce connecteur n'a pas de secret à saisir : enregistrer le redéclare et teste la connexion.",
    remoteNoFiles: "Seulement la façon dont Hermes se connecte au serveur. Les identifiants du serveur lui-même (clé de compte de service Google…) se règlent là où il est hébergé, pas ici.",
    secretsNote: "Transmis directement à Hermes : la base de l'app ne les conserve jamais.",
    authorize: "Autoriser",
    reconfigured: (name: string) => `« ${name} » reconfiguré.`,
  },
});
