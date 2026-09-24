/**
 * Translations shared by the web and mobile apps. A string that both apps show lives
 * here, under one key, so the wording can't drift; a string only one app uses stays
 * next to its screen, declared with the same `defineMessages`.
 */
export * from "./define";
export { common } from "./common";
export { auth } from "./auth";
export { conversations } from "./conversations";
export { integrations } from "./integrations";
