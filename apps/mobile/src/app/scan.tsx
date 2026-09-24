import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Alert, Button, Surface, Typography } from "heroui-native";
import { useRef, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { notAgoraQr, parsePairingUrl } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";

const t = defineMessages({
  en: {
    permission: "Agora needs the camera to scan the QR code shown on the web, in Settings › Mobile app.",
    allow: "Allow the camera",
    openSettings: "Open Settings",
    aim: "Aim at the QR code shown on your computer.",
  },
  fr: {
    permission: "Agora a besoin de la caméra pour scanner le QR code affiché sur le web, dans Paramètres › App mobile.",
    allow: "Autoriser la caméra",
    openSettings: "Ouvrir les Réglages",
    aim: "Vise le QR code affiché sur ton ordinateur.",
  },
});

export default function Scan() {
  const [permission, request] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  // The scanner fires many times per second: one code is handled at a time.
  const busy = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-6 px-6 py-6">
        <Alert>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.permission}</Alert.Description>
          </Alert.Content>
        </Alert>
        <Button size="lg" onPress={withTap(permission.canAskAgain ? request : () => Linking.openSettings())}>
          {permission.canAskAgain ? t.allow : t.openSettings}
        </Button>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (busy.current) return;
          busy.current = true;
          const pairing = parsePairingUrl(data);
          if (!pairing) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setHint(notAgoraQr);
            setTimeout(() => (busy.current = false), 1500);
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace({ pathname: "/connect", params: pairing });
        }}
      />
      {/* Target square: where to place the code. */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="aspect-square w-2/3 rounded-3xl border-4 border-white/90" />
      </View>
      {/* Floats over the camera. */}
      <View className="absolute inset-x-0 bottom-0 items-center px-6 pb-14">
        <Surface>
          <Typography.Paragraph align="center">{hint ?? t.aim}</Typography.Paragraph>
        </Surface>
      </View>
    </View>
  );
}
