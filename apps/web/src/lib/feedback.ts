import { MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { common } from "@agora/core/i18n";
import { tr } from "@/i18n";

/**
 * Toasts for actions (sonner, mounted once in main.tsx). Every mutation that fails says so,
 * with the server's reason; its `meta` adds the rest:
 *
 *   useMutation({ mutationFn, meta: { loading: t.installing, success: t.installed } })
 *   meta: { error: false }  // the form shows the error itself, next to its button
 */
export type MutationFeedback = {
  /** Shown while a slow action runs, then replaced by its outcome; a function gets the variables. */
  loading?: string | ((variables: any) => string);
  /** Shown when the action worked; a function gets the result and the variables (undefined: nothing). */
  success?: string | ((data: any, variables: any) => string | undefined);
  /** Title of the failure toast, the reason going underneath; false: the screen shows the error itself. */
  error?: string | false;
};

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: MutationFeedback;
  }
}

export const errorMessage = (error: unknown) => (error instanceof Error && error.message) || tr(common).unknownError;

/** A failure outside of a mutation (clipboard, upload, OAuth window…). */
export const toastError = (error: unknown, title?: string) =>
  toast.error(title ?? errorMessage(error), { description: title ? errorMessage(error) : undefined });

/** Copies from a menu, which closes: the toast is the only sign it worked. */
export const copyText = (text: string) =>
  navigator.clipboard.writeText(text).then(
    () => void toast.success(tr(common).copied),
    (e: unknown) => void toastError(e),
  );

const toastId = (mutationId: number) => `mutation-${mutationId}`;

export const mutationCache = new MutationCache({
  onMutate: (variables, mutation) => {
    const { loading } = mutation.meta ?? {};
    if (loading) toast.loading(typeof loading === "function" ? loading(variables) : loading, { id: toastId(mutation.mutationId) });
  },
  onSuccess: (data, variables, _result, mutation) => {
    const { success, loading } = mutation.meta ?? {};
    const label = typeof success === "function" ? success(data, variables) : success;
    if (label) toast.success(label, { id: toastId(mutation.mutationId) });
    else if (loading) toast.dismiss(toastId(mutation.mutationId));
  },
  onError: (error, _variables, _result, mutation) => {
    const { error: title, loading } = mutation.meta ?? {};
    const id = toastId(mutation.mutationId);
    if (title === false) {
      if (loading) toast.dismiss(id);
      return;
    }
    toast.error(title ?? errorMessage(error), { id, description: title ? errorMessage(error) : undefined });
  },
});
