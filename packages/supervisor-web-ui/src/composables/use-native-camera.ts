import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import { isNativeApp } from "./use-native-app";

export async function capturePhotoForChat(): Promise<File | null> {
  if (!isNativeApp()) return null;
  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
  });
  if (!photo.path && !photo.webPath) return null;
  const url = photo.webPath ?? photo.path!;
  const response = await fetch(url);
  const blob = await response.blob();
  const ext = photo.format === "png" ? "png" : "jpeg";
  const mimeType = blob.type || (ext === "png" ? "image/png" : "image/jpeg");
  return new File([blob], `photo-${Date.now()}.${ext}`, { type: mimeType });
}

export async function pickChatImage(): Promise<File | null> {
  if (!isNativeApp()) return null;
  return capturePhotoForChat();
}
