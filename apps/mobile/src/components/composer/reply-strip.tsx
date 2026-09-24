import { Image as ExpoImage } from "expo-image";
import { Card, CloseButton, Separator, Surface } from "heroui-native";
import { withUniwind } from "uniwind";
import { attachmentUrl, authHeaders } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { ReplyTo } from "@/lib/types";
import { isImage } from "@/components/attachment-files";

/*
 * The web's QuoteBlock above the composer (apps/web/src/components/MessageParts.tsx): the message being answered.
 * At the messages' size (text-body), as the field under it.
 */

const messages = defineMessages({
  en: { photo: "Photo", cancelReply: "Cancel reply" },
  fr: { photo: "Photo", cancelReply: "Annuler la réponse" },
});

const Image = withUniwind(ExpoImage);

export function ReplyStrip({ quote, onCancel }: { quote: ReplyTo; onCancel: () => void }) {
  const t = messages;
  const image = quote.attachment && isImage(quote.attachment.mime) ? quote.attachment : null;
  const label = quote.text || (image ? t.photo : (quote.attachment?.name ?? ""));
  return (
    <Card variant="tertiary" className="flex-row items-center gap-2.5 p-2.5">
      <Separator orientation="vertical" variant="thick" className="self-stretch" />
      <Card.Body className="min-w-0 flex-1 gap-0">
        <Card.Title numberOfLines={1} className="text-body font-semibold">{quote.authorName}</Card.Title>
        <Card.Description numberOfLines={1} className="text-body">{label}</Card.Description>
      </Card.Body>
      {image && (
        <Surface variant="secondary" className="size-9 p-0">
          <Image
            source={{ uri: attachmentUrl(image.id), headers: authHeaders() }}
            cachePolicy="disk"
            contentFit="cover"
            accessibilityIgnoresInvertColors
            className="size-full"
          />
        </Surface>
      )}
      <CloseButton size="sm" accessibilityLabel={t.cancelReply} onPress={withTap(onCancel)} />
    </Card>
  );
}
