import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ListGroup, SkeletonGroup, Spinner } from "heroui-native";
import { ErrorAlert, RowMenu, Section, useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { api } from "@/lib/api";
import { devicesQuery } from "@/lib/admin";
import { dividerLabel } from "@/lib/dates";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";

/*
 * apps/web/src/components/MobileApp.tsx without the QR code (it is shown on the web, scanned here):
 * the phones signed in to the account, each one can be signed out. For every member, not only admins.
 */

const messages = defineMessages({
  en: {
    title: "Connected phones",
    help: "Connect another phone by scanning the QR code shown in Settings › General on the web.",
    unnamed: "Phone",
    paired: (when: string) => `Connected ${when}`,
    disconnect: "Sign out",
    disconnectTitle: (name: string) => `Sign out ${name}?`,
    disconnectHelp: "The app on this phone will have to be connected again with a new QR code.",
    disconnected: (name: string) => `${name} signed out.`,
  },
  fr: {
    title: "Téléphones connectés",
    help: "Connecte un autre téléphone en scannant le QR code affiché dans Paramètres › Général sur le web.",
    unnamed: "Téléphone",
    paired: (when: string) => `Connecté ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    disconnect: "Déconnecter",
    disconnectTitle: (name: string) => `Déconnecter ${name} ?`,
    disconnectHelp: "L'app de ce téléphone devra être reconnectée avec un nouveau QR code.",
    disconnected: (name: string) => `${name} déconnecté.`,
  },
});

export function ConnectedPhones() {
  const t = messages;
  const qc = useQueryClient();
  const toast = useAdminToast();
  const devices = useQuery(devicesQuery);
  const disconnect = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => api(`/mobile/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: (_, { name }) => toast.success(t.disconnected(name)),
    onError: (e) => toast.failed(e),
    onSettled: () => qc.invalidateQueries({ queryKey: devicesQuery.queryKey }),
  });
  const ask = async (id: string, name: string) => {
    if (await confirmAction({ title: t.disconnectTitle(name), description: t.disconnectHelp, action: t.disconnect })) disconnect.mutate({ id, name });
  };

  return (
    <>
      <Section title={t.title} footer={t.help}>
        {devices.isPending && (
          <SkeletonGroup isLoading isSkeletonOnly className="gap-2 px-4 py-3">
            <SkeletonGroup.Item className="h-4 w-1/2 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-3/4 rounded-md" />
          </SkeletonGroup>
        )}
        {devices.data?.map((d) => {
          const name = d.name || t.unnamed;
          const busy = disconnect.isPending && disconnect.variables?.id === d.id;
          return (
            <RowMenu key={d.id} actions={[{ label: t.disconnect, icon: "rectangle.portrait.and.arrow.right", destructive: true, disabled: busy, onPress: () => ask(d.id, name) }]}>
              <ListGroup.Item disabled>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>{t.paired(dividerLabel(new Date(d.pairedAt)))}</ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  {busy ? (
                    <Spinner size="sm" />
                  ) : (
                    <Button size="sm" variant="danger-soft" onPress={withTap(() => ask(d.id, name))}>
                      {t.disconnect}
                    </Button>
                  )}
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </RowMenu>
          );
        })}
      </Section>
      {!!devices.error && <ErrorAlert error={devices.error} />}
    </>
  );
}
