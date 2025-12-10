// Pipeline map — capture schema:
// - Shared list of required poses so both capture UI and upload validators stay aligned (4 uploads per scan).
export type Pose = "front" | "back" | "left" | "right";
export const POSES: Pose[] = ["front", "back", "left", "right"];
export const POSE_LABEL: Record<Pose, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
};
