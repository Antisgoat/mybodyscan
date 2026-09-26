import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

export function usesNativePhotoPicker(): boolean {
  return Capacitor.isNativePlatform();
}

export async function takeNativePhoto(): Promise<string> {
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.DataUrl,
    quality: 82,
    width: 1600,
    height: 1600,
    correctOrientation: true,
    saveToGallery: false,
    presentationStyle: "fullscreen",
  });
  if (!photo.dataUrl) throw new Error("camera_photo_unavailable");
  return photo.dataUrl;
}

export async function chooseNativePhoto(): Promise<string> {
  const photo = await Camera.getPhoto({
    source: CameraSource.Photos,
    resultType: CameraResultType.DataUrl,
    quality: 82,
    width: 1600,
    height: 1600,
    correctOrientation: true,
    saveToGallery: false,
    presentationStyle: "fullscreen",
  });
  if (!photo.dataUrl) throw new Error("library_photo_unavailable");
  return photo.dataUrl;
}

export function isMediaPickerCancellation(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error)
    .toLowerCase()
    .trim();
  return message.includes("cancel") || message.includes("user cancelled");
}

export async function dataUrlToImageFile(
  dataUrl: string,
  name = "photo.jpg"
): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
