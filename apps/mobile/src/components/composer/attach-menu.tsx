import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { MenuButton } from "@/components/menus";
import { defineMessages } from "@/lib/i18n";

/*
 * Where files come from on the phone: the photo library, the camera or Files (no drag and drop, no
 * paste). The "+" of the composer opens a menu; `open` is controlled so the "/" menu's "Attach
 * files" opens the same one.
 */

const messages = defineMessages({
  en: { attachFiles: "Attach files", photoLibrary: "Photo Library", takePhoto: "Camera", files: "Files" },
  fr: { attachFiles: "Joindre des fichiers", photoLibrary: "Photothèque", takePhoto: "Appareil photo", files: "Fichiers" },
});

/** A file picked on the phone; `size` is unknown for some photos (the server checks it again). */
export type LocalFile = { uri: string; name: string; mime: string; size?: number };

const fromAsset = (a: ImagePicker.ImagePickerAsset): LocalFile => ({
  uri: a.uri,
  name: a.fileName ?? a.uri.split("/").pop() ?? "photo.jpg",
  mime: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
  size: a.fileSize,
});

async function pickPhotos(): Promise<LocalFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 });
  return res.canceled ? [] : res.assets.map(fromAsset);
}

async function takePhoto(): Promise<LocalFile[]> {
  if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return [];
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  return res.canceled ? [] : res.assets.map(fromAsset);
}

async function pickDocuments(): Promise<LocalFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  return res.canceled ? [] : res.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType ?? "application/octet-stream", size: a.size }));
}

const run = (source: () => Promise<LocalFile[]>, onFiles: (files: LocalFile[]) => void) =>
  source().then(
    (files) => files.length && onFiles(files),
    (err) => console.error("attach", err),
  );

const sources = () => [
  { label: messages.photoLibrary, icon: "photo.on.rectangle" as const, pick: pickPhotos },
  { label: messages.takePhoto, icon: "camera" as const, pick: takePhoto },
  { label: messages.files, icon: "doc" as const, pick: pickDocuments },
];

/** The "+" of the composer's toolbar: photo library, camera, Files; `open` lets the "/" menu open it too. */
export function AttachMenu({ open, onOpenChange, onFiles }: { open: boolean; onOpenChange: (open: boolean) => void; onFiles: (files: LocalFile[]) => void }) {
  return (
    <MenuButton
      icon="plus"
      // A ring, as ChatGPT's: a gray circle would vanish on the composer's gray card.
      variant="outline"
      // Above the "+": the composer sits on the keyboard.
      placement="top"
      label={messages.attachFiles}
      open={open}
      onOpenChange={onOpenChange}
      actions={sources().map(({ label, icon, pick }) => ({ label, icon, onPress: () => run(pick, onFiles) }))}
    />
  );
}
