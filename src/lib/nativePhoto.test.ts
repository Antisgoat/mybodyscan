import { beforeEach, describe, expect, it, vi } from "vitest";
const camera = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getPhoto: vi.fn(),
  native: vi.fn(),
}));
vi.mock("@capacitor/camera", () => ({
  Camera: camera,
  CameraResultType: { DataUrl: "dataUrl" },
  CameraSource: { Camera: "CAMERA", Photos: "PHOTOS" },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: camera.native },
}));
import {
  chooseNativePhoto,
  isMediaPickerCancellation,
  takeNativePhoto,
  usesNativePhotoPicker,
} from "./nativePhoto";

beforeEach(() => {
  vi.resetAllMocks();
  camera.checkPermissions.mockResolvedValue({
    camera: "granted",
    photos: "granted",
  });
  camera.getPhoto.mockResolvedValue({
    dataUrl: "data:image/jpeg;base64,dGVzdA==",
  });
});

describe("native camera/library contracts (not physical-device tests)", () => {
  it("uses the platform flag to choose the native picker", () => {
    camera.native.mockReturnValue(true);
    expect(usesNativePhotoPicker()).toBe(true);
    camera.native.mockReturnValue(false);
    expect(usesNativePhotoPicker()).toBe(false);
  });
  it("requests an upright, full-screen camera photo without saving to the gallery", async () => {
    expect(await takeNativePhoto()).toBe("data:image/jpeg;base64,dGVzdA==");
    expect(camera.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "CAMERA",
        resultType: "dataUrl",
        correctOrientation: true,
        presentationStyle: "fullscreen",
        saveToGallery: false,
      })
    );
    expect(camera.requestPermissions).not.toHaveBeenCalled();
  });
  it("does not open a black camera view after permission is refused", async () => {
    camera.checkPermissions.mockResolvedValue({ camera: "prompt" });
    camera.requestPermissions.mockResolvedValue({ camera: "denied" });
    await expect(takeNativePhoto()).rejects.toThrow("camera_permission_denied");
    expect(camera.getPhoto).not.toHaveBeenCalled();
  });
  it("continues after camera permission is granted", async () => {
    camera.checkPermissions.mockResolvedValue({ camera: "prompt" });
    camera.requestPermissions.mockResolvedValue({ camera: "granted" });
    await takeNativePhoto();
    expect(camera.requestPermissions).toHaveBeenCalledWith({
      permissions: ["camera"],
    });
    expect(camera.getPhoto).toHaveBeenCalledOnce();
  });
  it("accepts iOS limited-library permission without prompting again", async () => {
    camera.checkPermissions.mockResolvedValue({ photos: "limited" });
    await chooseNativePhoto();
    expect(camera.requestPermissions).not.toHaveBeenCalled();
    expect(camera.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ source: "PHOTOS", correctOrientation: true })
    );
  });
  it("handles denied library permission without opening the picker", async () => {
    camera.checkPermissions.mockResolvedValue({ photos: "denied" });
    camera.requestPermissions.mockResolvedValue({ photos: "denied" });
    await expect(chooseNativePhoto()).rejects.toThrow(
      "photo_permission_denied"
    );
    expect(camera.getPhoto).not.toHaveBeenCalled();
  });
  it("rejects empty results from either picker", async () => {
    camera.getPhoto.mockResolvedValue({});
    await expect(takeNativePhoto()).rejects.toThrow("camera_photo_unavailable");
    await expect(chooseNativePhoto()).rejects.toThrow(
      "library_photo_unavailable"
    );
  });
  it("distinguishes user cancellation from permission errors", () => {
    expect(
      isMediaPickerCancellation(new Error("User cancelled photos app"))
    ).toBe(true);
    expect(
      isMediaPickerCancellation(new Error("camera_permission_denied"))
    ).toBe(false);
  });
});
