import { defineMessages, tr } from "@/i18n";

const messages = defineMessages({
  en: { unreadable: "This image couldn't be read." },
  fr: { unreadable: "Cette image n'a pas pu être lue." },
});

const SIZE = 256;

/** Square of the source image to keep, in its pixels. */
export type CropRect = { x: number; y: number; side: number };

/** Reads a picked file; throws the "unreadable" message if it isn't an image the browser can decode. */
export async function readImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(tr(messages).unreadable);
  }
}

/** Renders the chosen square as a 256 px WebP: sharp enough for the app, light in the database. */
export async function cropAvatar(bitmap: ImageBitmap, crop: CropRect): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, SIZE, SIZE);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error(tr(messages).unreadable);
  return blob;
}
