/**
 * Run steps and errors are shown in the admin's "Updates" panel, in the admin's
 * interface language. The updater has no notion of language: alongside the
 * (French) `message`, kept for the updater's own logs and as a fallback for
 * clients that don't know a code, each step and error carries a stable `code`
 * plus `params` that the web app translates (apps/web/src/components/admin/Updates.tsx).
 * Codes are a contract with the web app: never rename one, add new ones instead.
 */
export type Params = Record<string, unknown>;

/** Error surfaced to the admin, serialized into a step's `params.error`. */
export type ErrorInfo = { message: string; code?: string; params?: Params };

/** Error with a translatable code. `message` stays readable in logs. */
export class UpdaterError extends Error {
  constructor(
    message: string,
    public code: string,
    public params: Params = {},
  ) {
    super(message);
  }
}

export function errorInfo(err: unknown): ErrorInfo {
  if (err instanceof UpdaterError) return { message: err.message, code: err.code, params: err.params };
  return { message: err instanceof Error ? err.message : String(err) };
}
