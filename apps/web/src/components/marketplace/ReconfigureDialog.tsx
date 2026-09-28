import { common, connectors } from "@agora/core/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorText } from "@/components/admin/ui";
import { ConnectorField } from "@/components/ConnectorField";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useT } from "@/i18n";
import { api, type McpRequest } from "@/lib/api";
import { needsOwnClient, oauthClientOf } from "@/lib/oauth-client";
import { OAuthClientFields } from "./OAuthClientFields";
import { useMcpOAuth } from "./use-mcp-oauth";

type Auth = McpRequest["auth"];

/** An installed connector opened again: new secrets, a new token or a new OAuth authorization. */
export function ReconfigureDialog({ request, onClose }: { request: McpRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">{request && <Form key={request.id} request={request} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function Form({ request: req, onClose }: { request: McpRequest; onClose: () => void }) {
  const t = useT(connectors);
  const c = useT(common);
  const qc = useQueryClient();
  const oauth = useMcpOAuth();
  const [auth, setAuth] = useState<Auth>(req.auth);
  const [token, setToken] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [client, setClient] = useState({ client_id: "", client_secret: "", scope: "" });
  const remote = req.transport === "remote";

  const save = useMutation({
    mutationFn: async () => {
      const install = (body: object) => api<McpRequest>(`/mcp-requests/${req.id}/install`, { method: "POST", body: JSON.stringify({ ...body, ...(remote && { auth }) }) });
      if (remote && auth === "oauth") {
        const oauth_client = oauthClientOf(client);
        await oauth.authorize(req.id, () => install(oauth_client ? { oauth_client } : {}));
        return;
      }
      await install({
        env: Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
        ...(auth === "header" && { bearer_token: token }),
      });
    },
    onSuccess: onClose,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["hermes"] });
      qc.invalidateQueries({ queryKey: ["mcp-requests"] });
      qc.invalidateQueries({ queryKey: ["mcp-request", req.id] });
    },
    // The dialog shows what failed next to its button.
    meta: { success: t.reconfigured(req.name), error: false },
  });

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.reconfigureName(req.name)}</DialogTitle>
        <DialogDescription>{t.reconfigureIntro}</DialogDescription>
      </DialogHeader>
      <p className="break-all font-mono text-xs text-muted-foreground">{req.url ?? req.command}</p>

      <FieldGroup className="gap-4">
        {remote ? (
          <>
            <Field className="gap-1.5">
              <FormLabel required>{t.auth}</FormLabel>
              <ToggleGroup variant="outline" spacing={1} value={[auth]} onValueChange={(v) => v[0] && setAuth(v[0] as Auth)}>
                {(["none", "header", "oauth"] as const).map((a) => (
                  <ToggleGroupItem key={a} value={a}>
                    {t.auths[a]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription className="text-xs">{t.remoteNoFiles}</FieldDescription>
            </Field>
            {auth === "header" && (
              <Field className="gap-1.5">
                <FormLabel htmlFor={`${req.id}-token`} required>
                  {t.token}
                </FormLabel>
                <Input
                  id={`${req.id}-token`}
                  type="password"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  className="font-mono"
                />
                <FieldDescription className="text-xs">{t.secretsNote}</FieldDescription>
              </Field>
            )}
            {auth === "oauth" && (
              <OAuthClientFields
                redirectUri={req.redirectUri ?? `${window.location.origin}/api/mcp-oauth/callback/${encodeURIComponent(req.name)}`}
                value={client}
                onChange={setClient}
                required={needsOwnClient(save.error)}
                disabled={save.isPending}
              />
            )}
          </>
        ) : req.env.length ? (
          <>
            {req.env.map((v) => (
              <ConnectorField
                key={v.name}
                id={`${req.id}-${v.name}`}
                // Left empty, a field keeps its current value.
                field={{ ...v, required: false }}
                value={values[v.name] ?? ""}
                fileName={fileNames[v.name]}
                onChange={(value, fileName) => {
                  setValues((vs) => ({ ...vs, [v.name]: value }));
                  if (fileName !== undefined) setFileNames((ns) => ({ ...ns, [v.name]: fileName }));
                }}
              />
            ))}
            <FieldDescription className="text-xs">
              {t.keepEmpty} {t.secretsNote}
            </FieldDescription>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t.noFields}</p>
        )}
      </FieldGroup>

      <ErrorText error={save.error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? (oauth.status ?? c.inProgress) : remote && auth === "oauth" ? t.authorize : c.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
