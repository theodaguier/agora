export type OAuthClient = { client_id: string; client_secret?: string; scope?: string };

export type OAuthClientValue = { client_id: string; client_secret: string; scope: string };

export const EMPTY_OAUTH_CLIENT: OAuthClientValue = { client_id: "", client_secret: "", scope: "" };

/** Hermes's error when the provider has no dynamic registration (or refuses it). */
export const needsOwnClient = (error: unknown) =>
  error instanceof Error && /manually-registered|dynamic (client )?registration|registration_not_supported|invalid_client_metadata|\bregister\b/i.test(error.message);

/** The fields as a client, or undefined while no Client ID is filled in. */
export function oauthClientOf(value: OAuthClientValue): OAuthClient | undefined {
  if (!value.client_id.trim()) return undefined;
  return {
    client_id: value.client_id.trim(),
    ...(value.client_secret && { client_secret: value.client_secret }),
    ...(value.scope.trim() && { scope: value.scope.trim() }),
  };
}
