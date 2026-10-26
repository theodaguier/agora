/** Serialize changes to one connector; the API and its event bus run in one process. */
const operations = new Map<string, Promise<unknown>>();

export async function withOAuthLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  const previous = operations.get(name);
  const current = (previous ?? Promise.resolve()).catch(() => {}).then(run);
  operations.set(name, current);
  try {
    return await current;
  } finally {
    if (operations.get(name) === current) operations.delete(name);
  }
}

export type OAuthFlow = { server_name: string; status: string; error: string | null; tools?: { name: string }[] };
type Request = { id: string; name: string; status: string };

/** Hermes's snapshot owns the server identity, including after an Agora API restart. */
export function createOAuthStatus<Row extends Request>(deps: {
  load: (id: string) => Promise<Row>;
  currentFlow: (name: string) => string | undefined;
  read: (flowId: string) => Promise<OAuthFlow>;
  finish: (row: Row, tools: string[]) => Promise<void>;
  error: (row: Row, error: string | null) => Promise<void>;
  invalidFlow: () => Error;
}) {
  return async (id: string, flowId: string) => {
    const initial = await deps.load(id);
    return withOAuthLock(initial.name, async () => {
      // Re-read after acquiring the lock: another poll may already have finalized it.
      const row = await deps.load(id);
      const current = deps.currentFlow(row.name);
      if (current && current !== flowId) throw deps.invalidFlow();
      const flow = await deps.read(flowId);
      if (flow.server_name !== row.name) throw deps.invalidFlow();
      if (flow.status === "approved" && row.status === "authorizing") await deps.finish(row, (flow.tools ?? []).map((t) => t.name));
      if (flow.status === "error" && row.status === "authorizing") await deps.error(row, flow.error);
      return { status: flow.status, error: flow.error };
    });
  };
}
