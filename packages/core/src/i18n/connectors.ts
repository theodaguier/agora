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
    remoteNoFiles: "A remote server only takes OAuth or an access token. For a service-account key (JSON file), remove it and add a local server instead.",
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
    remoteNoFiles: "Un serveur distant n'accepte qu'OAuth ou un jeton d'accès. Pour une clé de compte de service (fichier JSON), retire-le et ajoute un serveur local à la place.",
    secretsNote: "Transmis directement à Hermes : la base de l'app ne les conserve jamais.",
    authorize: "Autoriser",
    reconfigured: (name: string) => `« ${name} » reconfiguré.`,
  },
});
