import { BUILD_TAG } from "@/buildTag";
export default function BuildTag() {
  return (
    <div style={{ position: "fixed", bottom: 8, right: 8, opacity: 0.5, fontSize: 12 }}>
      build: {BUILD_TAG}
    </div>
  );
}
