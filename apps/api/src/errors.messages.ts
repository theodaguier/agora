import { defineMessages } from "./i18n";

/** Error messages shared by several routes and modules. */
export const errors = defineMessages({
  en: {
    hermesUnreachable: "Hermes is unreachable.",
    invalidRequest: "Invalid request",
    unexpected: "Unexpected error.",
    usernameTaken: "This username is already taken.",
    profileCreateFailed: "Couldn't create the Hermes profile.",
    requestNotFound: "Request not found",
    requestAlreadyHandled: "Request already handled",
    accessTokenRequired: "Access token required",
    unknownMcpServer: "Unknown MCP server",
    hermesHomeNotConfigured: "HERMES_HOME is not configured",
    notAllowed: "Action not allowed",
    botNotFound: "Bot not found",
  },
  fr: {
    hermesUnreachable: "Hermes est injoignable.",
    invalidRequest: "Requête invalide",
    unexpected: "Erreur inattendue.",
    usernameTaken: "Ce username est déjà pris.",
    profileCreateFailed: "Création du profil Hermes impossible.",
    requestNotFound: "Demande introuvable",
    requestAlreadyHandled: "Demande déjà traitée",
    accessTokenRequired: "Jeton d'accès requis",
    unknownMcpServer: "Serveur MCP inconnu",
    hermesHomeNotConfigured: "HERMES_HOME n'est pas configuré",
    notAllowed: "Action non autorisée",
    botNotFound: "Bot introuvable",
  },
});
