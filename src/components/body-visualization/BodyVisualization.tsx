import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { MathUtils } from "three";
import { Eye, Rotate3D } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { track } from "@/lib/analytics";
import type {
  BodyRegionId,
  BodyView,
  ParametricBodyProfile,
} from "@/lib/bodyVisualization";
import { BodyVisualizationFallback } from "./BodyVisualizationFallback";

type Props = {
  profile: ParametricBodyProfile;
  previousProfile?: ParametricBodyProfile | null;
  metrics?: { label: string; value: string }[];
};

const VIEW_ROTATION: Record<BodyView, number> = {
  front: 0,
  side: -Math.PI / 2,
  back: Math.PI,
};

const isWebGLSupported = () => {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
};

type FigureProps = {
  profile: ParametricBodyProfile;
  selectedRegion: BodyRegionId;
  onSelectRegion?: (region: BodyRegionId) => void;
  view: BodyView;
  ghost?: boolean;
  reducedMotion?: boolean;
};

function BodyFigure({
  profile,
  selectedRegion,
  onSelectRegion,
  view,
  ghost = false,
  reducedMotion = false,
}: FigureProps) {
  const group = useRef<Group>(null);
  const reveal = useRef(reducedMotion ? 1 : 0);
  const baseColor = ghost ? "#a5f3fc" : "#155e75";
  const selectedColor = ghost ? "#a5f3fc" : "#67e8f9";
  const bodyMaterial = (region: BodyRegionId) => ({
    color: selectedRegion === region ? selectedColor : baseColor,
    roughness: 0.52,
    metalness: ghost ? 0 : 0.2,
    transparent: ghost,
    opacity: ghost ? 0.16 : 1,
    depthWrite: !ghost,
  });

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y = MathUtils.damp(
      group.current.rotation.y,
      VIEW_ROTATION[view],
      reducedMotion ? 30 : 7,
      delta
    );
    if (reveal.current < 1) {
      reveal.current = Math.min(1, reveal.current + delta * 1.6);
      const eased = 1 - Math.pow(1 - reveal.current, 3);
      group.current.scale.setScalar(profile.heightScale * eased);
    }
  });

  const select = (region: BodyRegionId) => {
    if (!ghost) onSelectRegion?.(region);
  };

  return (
    <group
      ref={group}
      scale={profile.heightScale * (ghost ? 1.012 : reducedMotion ? 1 : 0.01)}
      position={ghost ? [0, 0, -0.035] : [0, 0, 0]}
    >
      <mesh position={[0, 2.65, 0]} onClick={() => select("upper")}>
        <sphereGeometry args={[0.32, 24, 20]} />
        <meshStandardMaterial {...bodyMaterial("upper")} />
      </mesh>
      <mesh position={[0, 2.25, 0]} onClick={() => select("upper")}>
        <capsuleGeometry args={[0.13, 0.22, 6, 16]} />
        <meshStandardMaterial {...bodyMaterial("upper")} />
      </mesh>
      <mesh
        position={[0, 1.84, 0]}
        scale={[
          profile.shoulderScale * 1.12,
          0.5,
          profile.depthScale * 0.76,
        ]}
        onClick={() => select("upper")}
      >
        <sphereGeometry args={[0.67, 24, 18]} />
        <meshStandardMaterial {...bodyMaterial("upper")} />
      </mesh>
      <mesh
        position={[0, 1.55, 0]}
        scale={[profile.chestScale, 1, profile.depthScale * 0.78]}
        onClick={() => select("upper")}
      >
        <capsuleGeometry args={[0.61, 0.72, 8, 20]} />
        <meshStandardMaterial {...bodyMaterial("upper")} />
      </mesh>
      <mesh
        position={[0, 0.66, 0]}
        scale={[profile.waistScale, 1, profile.depthScale]}
        onClick={() => select("core")}
      >
        <capsuleGeometry args={[0.49, 0.65, 8, 20]} />
        <meshStandardMaterial {...bodyMaterial("core")} />
      </mesh>
      <mesh
        position={[0, -0.05, 0]}
        scale={[profile.hipScale, 0.72, profile.depthScale * 0.92]}
        onClick={() => select("hips")}
      >
        <sphereGeometry args={[0.58, 24, 18]} />
        <meshStandardMaterial {...bodyMaterial("hips")} />
      </mesh>
      {[-1, 1].map((side) => (
        <group
          key={`arm-${side}`}
          position={[side * 0.83 * profile.shoulderScale, 1.12, 0]}
        >
          <mesh
            rotation={[0, 0, side * -0.06]}
            scale={[profile.armScale, 1, profile.armScale]}
            onClick={() => select("arms")}
          >
            <capsuleGeometry args={[0.16, 1.55, 7, 16]} />
            <meshStandardMaterial {...bodyMaterial("arms")} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`leg-${side}`}
          position={[side * 0.3 * profile.hipScale, -1.48, 0]}
          scale={[
            profile.legScale,
            1,
            profile.legScale * profile.depthScale * 0.9,
          ]}
          onClick={() => select("legs")}
        >
          <capsuleGeometry args={[0.25, 2.15, 8, 18]} />
          <meshStandardMaterial {...bodyMaterial("legs")} />
        </mesh>
      ))}
    </group>
  );
}

export default function BodyVisualization({
  profile,
  previousProfile,
  metrics = [],
}: Props) {
  const [view, setView] = useState<BodyView>("front");
  const [selectedRegion, setSelectedRegion] = useState<BodyRegionId>("upper");
  const [showPrevious, setShowPrevious] = useState(false);
  const [webGL] = useState(isWebGLSupported);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const activeInsight =
    profile.regions.find((region) => region.id === selectedRegion) ??
    profile.regions[0];

  useEffect(() => {
    track(webGL ? "body_visualization_loaded" : "body_visualization_fallback");
  }, [webGL]);

  const selectView = (nextView: BodyView) => {
    setView(nextView);
    track("body_visualization_view_changed", { view: nextView });
  };

  const selectRegion = (region: BodyRegionId) => {
    setSelectedRegion(region);
    track("body_visualization_region_selected", { region });
  };

  return (
    <section
      className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-[#0d2026] via-[#0b1519] to-[#090d10]"
      aria-labelledby="body-visualization-heading"
    >
      <div className="border-b border-white/10 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Interactive scan view
            </p>
            <h2
              id="body-visualization-heading"
              className="mt-2 text-2xl font-semibold"
            >
              Explore your body profile
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              A personalized illustration shaped by supported scan metrics. Drag
              to rotate, zoom, or choose a body region for its related insight.
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
            Parametric visualization
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,.55fr)]">
        <div className="relative min-h-[400px] border-b border-white/10 lg:min-h-[540px] lg:border-b-0 lg:border-r">
          {metrics.length > 0 ? (
            <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
              {metrics.slice(0, 3).map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 backdrop-blur"
                >
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                    {metric.label}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-white">
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {webGL ? (
            <Canvas
              className="touch-none"
              dpr={[1, 1.5]}
              camera={{ position: [0, 0.15, 9.8], fov: 38 }}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: "high-performance",
              }}
              aria-hidden="true"
            >
              <ambientLight intensity={1.5} />
              <directionalLight
                position={[3, 5, 5]}
                intensity={2.1}
                color="#cffafe"
              />
              <directionalLight
                position={[-4, 1, -3]}
                intensity={1.1}
                color="#2563eb"
              />
              {showPrevious && previousProfile ? (
                <BodyFigure
                  profile={previousProfile}
                  selectedRegion={selectedRegion}
                  view={view}
                  ghost
                  reducedMotion={reducedMotion}
                />
              ) : null}
              <BodyFigure
                profile={profile}
                selectedRegion={selectedRegion}
                onSelectRegion={selectRegion}
                view={view}
                reducedMotion={reducedMotion}
              />
              <OrbitControls
                enablePan={false}
                minDistance={7.2}
                maxDistance={12}
                minPolarAngle={Math.PI / 2}
                maxPolarAngle={Math.PI / 2}
              />
            </Canvas>
          ) : (
            <BodyVisualizationFallback
              profile={profile}
              selectedRegion={selectedRegion}
              onSelectRegion={selectRegion}
            />
          )}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-black/70 p-1 backdrop-blur">
            {(["front", "side", "back"] as BodyView[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => selectView(option)}
                aria-pressed={view === option}
                className={`min-h-10 rounded-full px-4 text-xs font-medium capitalize transition ${
                  view === option
                    ? "bg-cyan-300 text-slate-950"
                    : "text-zinc-300 hover:bg-white/10"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-5 md:p-6">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Rotate3D className="h-4 w-4 text-cyan-300" />
            {webGL
              ? "Drag to rotate · pinch or scroll to zoom"
              : "2D fallback view"}
          </div>

          {previousProfile ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <label
                htmlFor="previous-scan-overlay"
                className="flex items-center gap-2 text-sm"
              >
                <Eye className="h-4 w-4 text-cyan-300" /> Previous-scan overlay
              </label>
              <Switch
                id="previous-scan-overlay"
                checked={showPrevious}
                onCheckedChange={(checked) => {
                  setShowPrevious(checked);
                  track("body_visualization_ghost_toggled", {
                    enabled: checked,
                  });
                }}
              />
            </div>
          ) : null}

          <div
            role="group"
            aria-label="Body regions"
            className="grid grid-cols-2 gap-2 lg:grid-cols-1"
          >
            {profile.regions.map((region) => (
              <Button
                key={region.id}
                type="button"
                variant="outline"
                onClick={() => selectRegion(region.id)}
                aria-pressed={selectedRegion === region.id}
                className={`h-auto min-h-11 justify-start border-white/10 bg-transparent px-3 py-2 text-left text-sm ${
                  selectedRegion === region.id
                    ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                    : "text-zinc-300"
                }`}
              >
                {region.label}
              </Button>
            ))}
          </div>

          <div
            aria-live="polite"
            className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4"
          >
            <div className="text-xs uppercase tracking-widest text-cyan-300">
              {activeInsight.label}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-200">
              {activeInsight.value}
            </p>
            {activeInsight.score != null ? (
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-cyan-300"
                  style={{ width: `${activeInsight.score * 10}%` }}
                />
              </div>
            ) : null}
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            Illustrative wellness visualization only. Proportions are derived
            conservatively from supported scan data; this is not a unique body
            mesh, anatomical measurement, diagnosis, or outcome prediction.
          </p>
        </div>
      </div>
    </section>
  );
}
