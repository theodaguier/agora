import { Directory, File, Paths } from "expo-file-system";
import { Image as ExpoImage } from "expo-image";
import * as Sharing from "expo-sharing";
import { withUniwind } from "uniwind";
import { attachmentUrl, authHeaders } from "@/lib/api";
import type { Attachment } from "@/lib/types";

export const isImage = (mime: string) => mime.startsWith("image/");

export type Shown = Attachment & { previewUri?: string };

/** expo-image with `className`. */
export const Image = withUniwind(ExpoImage);

/** Where an image is read from: the file on the phone while it is being sent, else the instance. */
export const attachmentSource = (a: { id: string; previewUri?: string }) =>
  a.previewUri ? { uri: a.previewUri } : { uri: attachmentUrl(a.id), headers: authHeaders() };

/** The web's `<a download>`: downloads the file into the cache, then hands it to the share sheet. */
export async function saveAttachment(a: Shown) {
  try {
    let uri = a.previewUri;
    if (!uri) {
      const dir = new Directory(Paths.cache, "attachments", a.id);
      dir.create({ intermediates: true, idempotent: true });
      const file = await File.downloadFileAsync(attachmentUrl(a.id, true), new File(dir, a.name.replace(/[/\\]/g, "_")), {
        headers: authHeaders(),
        idempotent: true,
      });
      uri = file.uri;
    }
    await Sharing.shareAsync(uri, { mimeType: a.mime, dialogTitle: a.name });
  } catch {
    // Like a failed browser download: nothing to show, the share sheet simply doesn't open.
  }
}
