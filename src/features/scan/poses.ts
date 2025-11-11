export type Pose = "front" | "back" | "left" | "right";
export const POSES: Pose[] = ["front", "back", "left", "right"];
export const POSE_LABEL: Record<Pose, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
};
