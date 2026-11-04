import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { confirmAction } from "@/lib/confirm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { CardAction, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
import { dividerLabel } from "@/lib/dates";

const messages = defineMessages({
  en: {
    connect: "Connect the mobile app",
    connectHelp: "Scan a QR code with the Agora app to sign in on your phone, without a password.",
    showQr: "Show QR code",
    qrTitle: "Scan with the Agora app",
    qrHelp: "Open the Agora app on your phone and scan this code. It works once and expires after two minutes.",
    qrFailed: "Couldn't create the QR code.",
    unnamed: "Phone",
    paired: (when: string) => `Connected ${when}`,
    disconnect: "Sign out",
    disconnectTitle: (name: string) => `Sign out ${name}?`,
    disconnectHelp: "The app on this phone will have to be connected again with a new QR code.",
    disconnected: "Phone signed out.",
    noDevices: "No phone connected yet.",
    devicesUnavailable: "Connected phones unreachable for now.",
  },
  fr: {
    connect: "Connecter l'app mobile",
    connectHelp: "Scanne un QR code avec l'app Agora pour te connecter sur ton téléphone, sans mot de passe.",
    showQr: "Afficher le QR code",
    qrTitle: "Scanne avec l'app Agora",
    qrHelp: "Ouvre l'app Agora sur ton téléphone et scanne ce code. Il ne sert qu'une fois et expire au bout de deux minutes.",
    qrFailed: "Impossible de créer le QR code.",
    unnamed: "Téléphone",
    paired: (when: string) => `Connecté ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    disconnect: "Déconnecter",
    disconnectTitle: (name: string) => `Déconnecter ${name} ?`,
    disconnectHelp: "L'app de ce téléphone devra être reconnectée avec un nouveau QR code.",
    disconnected: "Téléphone déconnecté.",
    noDevices: "Aucun téléphone connecté pour l'instant.",
    devicesUnavailable: "Téléphones connectés injoignables pour l'instant.",
  },
});

type Device = { id: string; name: string; pairedAt: string; lastActiveAt: string };
type Link = { code: string; expiresAt: string };

const devicesKey = ["mobile", "devices"];

/**
 * Address the phone connects to: the one this page is open on. In development the page is on
 * localhost, which a phone can't reach: VITE_MOBILE_SERVER_URL (e.g. http://192.168.1.20:3001) overrides it.
 */
const serverUrl = () => (import.meta.env.VITE_MOBILE_SERVER_URL as string | undefined) || window.location.origin;

/** Pairing of the mobile app (Settings › Mobile app): QR code, then the phones signed in to the account. */
export function MobileApp() {
  const t = useT(messages);
  const qc = useQueryClient();
  // Phones paired when the QR code was opened; null while it is closed.
  const [countAtOpen, setCountAtOpen] = useState<number | null>(null);
  const devices = useQuery({
    queryKey: devicesKey,
    queryFn: () => api<Device[]>("/mobile/devices"),
    // While the QR code is shown, watch for the phone that scans it.
    refetchInterval: countAtOpen !== null ? 2000 : false,
  });
  const count = devices.data?.length ?? 0;
  // Closes as soon as a new phone shows up in the list: the scan worked.
  if (countAtOpen !== null && count > countAtOpen) setCountAtOpen(null);
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/mobile/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: devicesKey }),
    meta: { success: t.disconnected },
  });

  return (
    <ListCard>
      <ListCardHeader>
        <CardTitle>{t.connect}</CardTitle>
        <CardDescription>{t.connectHelp}</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setCountAtOpen(count)}>
            {t.showQr}
          </Button>
        </CardAction>
      </ListCardHeader>
      {/* The phones signed in to the account. */}
      {devices.isPending ? (
        <CardContent className="flex flex-col gap-2 py-(--card-spacing)">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </CardContent>
      ) : !devices.data?.length ? (
        <CardContent className="py-(--card-spacing)">
          <p className="text-sm text-muted-foreground">{devices.isError ? t.devicesUnavailable : t.noDevices}</p>
        </CardContent>
      ) : (
        <ListCardRows>
          {devices.data.map((d) => {
            const name = d.name || t.unnamed;
            return (
              <Item key={d.id}>
                <ItemContent>
                  <ItemTitle>{name}</ItemTitle>
                  <ItemDescription>{t.paired(dividerLabel(new Date(d.pairedAt)))}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnect.isPending && disconnect.variables === d.id}
                    onClick={async () => {
                      if (await confirmAction({ title: t.disconnectTitle(name), description: t.disconnectHelp, action: t.disconnect })) disconnect.mutate(d.id);
                    }}
                  >
                    {t.disconnect}
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </ListCardRows>
      )}
      <QrDialog open={countAtOpen !== null} onClose={() => setCountAtOpen(null)} />
    </ListCard>
  );
}

function QrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const link = useQuery({
    queryKey: ["mobile", "link"],
    queryFn: () => api<Link>("/mobile/link", { method: "POST" }),
    enabled: open,
    gcTime: 0,
    staleTime: Infinity,
    // A fresh code shortly before this one expires.
    refetchInterval: (q) => (q.state.data ? Math.max(1000, new Date(q.state.data.expiresAt).getTime() - Date.now() - 10_000) : false),
  });

  const url = link.data && `agora://connect?server=${encodeURIComponent(serverUrl())}&code=${encodeURIComponent(link.data.code)}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.qrTitle}</DialogTitle>
          <DialogDescription>{t.qrHelp}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-2">
          {/* Dark on white in both themes: scanners read that best. */}
          <div className="grid size-60 place-items-center rounded-xl bg-white p-4">
            {url ? (
              <QRCodeSVG value={url} size={208} level="M" marginSize={0} />
            ) : (
              <span className="text-sm text-neutral-500">{link.isError ? t.qrFailed : tc.loading}</span>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tc.close}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
