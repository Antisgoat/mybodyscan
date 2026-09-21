import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
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
import { createBodyLoftGeometry } from "@/lib/parametricBodyGeometry";
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
  // Warm studio clay reads as a human form without implying that this
  // parametric model reproduces skin tone or photographic identity.
  const baseColor = ghost ? "#bae6fd" : "#b98973";
  const selectedColor = ghost ? "#bae6fd" : "#bf907b";
  const torsoY = (value: number) =>
    -0.18 + (value + 0.18) * profile.torsoLengthScale;
  const shoulderY = torsoY(1.94);
  const neckY = torsoY(2.19);
  const headY = neckY + 0.39;
  const frontDepth = 0.39 * profile.depthScale;
  const armY = (value: number) =>
    0.76 + (value - 0.76) * profile.armLengthScale;
  const legY = (value: number) =>
    -0.22 + (value + 0.22) * profile.legLengthScale;

  const geometries = useMemo(() => {
    const bodyY = (value: number) =>
      -0.18 + (value + 0.18) * profile.torsoLengthScale;
    const bodyShoulderY = bodyY(1.94);
    const bodyNeckY = bodyY(2.19);
    const bodyArmY = (value: number) =>
      0.76 + (value - 0.76) * profile.armLengthScale;
    const bodyLegY = (value: number) =>
      -0.22 + (value + 0.22) * profile.legLengthScale;
    const trunk = createBodyLoftGeometry([
      {
        y: -0.24,
        radiusX: 0.43 * profile.hipScale,
        radiusZ: 0.36 * profile.hipDepthScale,
        centerZ: -0.025,
      },
      {
        y: 0,
        radiusX: 0.58 * profile.hipScale,
        radiusZ: 0.45 * profile.hipDepthScale,
        centerZ: -0.015,
      },
      {
        y: bodyY(0.23),
        radiusX: 0.54 * profile.hipScale,
        radiusZ: 0.42 * profile.hipDepthScale,
        centerZ: profile.abdominalProjection * 0.45,
      },
      {
        y: bodyY(0.48),
        radiusX: 0.5 * (profile.hipScale * 0.4 + profile.waistScale * 0.6),
        radiusZ: 0.4 * (profile.depthScale * 0.7 + profile.hipDepthScale * 0.3),
        centerZ: profile.abdominalProjection,
      },
      {
        y: bodyY(0.78),
        radiusX: 0.47 * profile.waistScale,
        radiusZ: 0.36 * profile.depthScale,
        centerZ: profile.abdominalProjection * 0.45,
      },
      {
        y: bodyY(1.08),
        radiusX: 0.54 * (profile.waistScale * 0.45 + profile.chestScale * 0.55),
        radiusZ: 0.39 * profile.depthScale,
        centerZ: profile.abdominalProjection * 0.25,
      },
      {
        y: bodyY(1.48),
        radiusX: 0.62 * profile.chestScale,
        radiusZ: 0.43 * profile.depthScale,
      },
      {
        y: bodyY(1.78),
        radiusX: 0.69 * profile.shoulderScale,
        radiusZ: 0.4 * profile.depthScale,
      },
      {
        y: bodyShoulderY,
        radiusX: 0.62 * profile.shoulderScale,
        radiusZ: 0.34 * profile.depthScale,
      },
      {
        y: bodyY(2.1),
        radiusX: 0.28 * profile.neckScale,
        radiusZ: 0.24 * profile.neckScale,
      },
    ]);
    const arm = createBodyLoftGeometry([
      {
        y: bodyArmY(-0.82),
        radiusX: 0.085 * profile.armScale,
        radiusZ: 0.075 * profile.armScale,
      },
      {
        y: bodyArmY(-0.58),
        radiusX: 0.12 * profile.armScale,
        radiusZ: 0.1 * profile.armScale,
      },
      {
        y: bodyArmY(-0.14),
        radiusX: 0.13 * profile.armScale,
        radiusZ: 0.115 * profile.armScale,
      },
      {
        y: bodyArmY(0.06),
        radiusX: 0.115 * profile.armScale,
        radiusZ: 0.11 * profile.armScale,
      },
      {
        y: bodyArmY(0.48),
        radiusX: 0.17 * profile.armScale,
        radiusZ: 0.16 * profile.armScale,
      },
      {
        y: bodyArmY(0.76),
        radiusX: 0.18 * profile.armScale,
        radiusZ: 0.17 * profile.armScale,
      },
    ]);
    const leg = createBodyLoftGeometry([
      {
        y: bodyLegY(-2.18),
        radiusX: 0.12 * profile.calfScale,
        radiusZ: 0.1 * profile.calfScale,
      },
      {
        y: bodyLegY(-1.72),
        radiusX: 0.2 * profile.calfScale,
        radiusZ: 0.17 * profile.calfScale,
      },
      {
        y: bodyLegY(-1.35),
        radiusX: 0.18 * profile.calfScale,
        radiusZ: 0.16 * profile.calfScale,
      },
      {
        y: bodyLegY(-1.14),
        radiusX: 0.17 * profile.legScale,
        radiusZ: 0.16 * profile.legScale,
      },
      {
        y: bodyLegY(-0.68),
        radiusX: 0.27 * profile.legScale,
        radiusZ: 0.24 * profile.legScale,
      },
      {
        y: bodyLegY(-0.22),
        radiusX: 0.31 * profile.legScale,
        radiusZ: 0.28 * profile.legScale,
      },
    ]);
    const neck = createBodyLoftGeometry([
      {
        y: bodyNeckY - 0.17,
        radiusX: 0.16 * profile.neckScale,
        radiusZ: 0.145 * profile.neckScale,
      },
      {
        y: bodyNeckY + 0.17,
        radiusX: 0.145 * profile.neckScale,
        radiusZ: 0.14 * profile.neckScale,
      },
    ]);
    return { trunk, arm, leg, neck };
  }, [profile]);

  useEffect(
    () => () =>
      Object.values(geometries).forEach((geometry) => geometry.dispose()),
    [geometries]
  );

  const bodyMaterial = (region: BodyRegionId) => ({
    color: selectedRegion === region ? selectedColor : baseColor,
    emissive: selectedRegion === region && !ghost ? "#4a2417" : "#120a08",
    emissiveIntensity: selectedRegion === region && !ghost ? 0.07 : 0.025,
    roughness: ghost ? 0.42 : 0.72 - profile.definitionScale * 0.1,
    metalness: 0,
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
      <mesh
        geometry={geometries.trunk}
        onClick={(event) => {
          const localY = event.point.y / profile.heightScale;
          select(localY > torsoY(0.85) ? "upper" : localY > torsoY(0.2) ? "core" : "hips");
        }}
      >
        <meshStandardMaterial {...bodyMaterial("upper")} />
      </mesh>
      <mesh geometry={geometries.neck} onClick={() => select("upper")}>
        <meshStandardMaterial {...bodyMaterial("upper")} />
      </mesh>
      <mesh
        position={[0, headY, 0]}
        scale={[
          0.29 * profile.headScale,
          0.37 * profile.headScale,
          0.31 * profile.headScale,
        ]}
        onClick={() => select("upper")}
      >
        <sphereGeometry args={[1, 32, 28]} />
        <meshStandardMaterial {...bodyMaterial("upper")} />
      </mesh>
      {!ghost ? (
        <>
          {[-1, 1].map((side) => (
            <mesh
              key={`ear-${side}`}
              position={[side * 0.285 * profile.headScale, headY + 0.015, 0]}
              scale={[0.035, 0.085, 0.045]}
              onClick={() => select("upper")}
            >
              <sphereGeometry args={[1, 18, 14]} />
              <meshStandardMaterial {...bodyMaterial("upper")} />
            </mesh>
          ))}
          <mesh
            position={[0, headY - 0.015, 0.305 * profile.headScale]}
            scale={[0.05, 0.09, 0.075]}
            rotation={[0.18, 0, 0]}
            onClick={() => select("upper")}
          >
            <sphereGeometry args={[1, 18, 14]} />
            <meshStandardMaterial {...bodyMaterial("upper")} />
          </mesh>
          <mesh
            position={[0, headY - 0.245 * profile.headScale, 0.12]}
            scale={[0.17, 0.08, 0.16]}
            onClick={() => select("upper")}
          >
            <sphereGeometry args={[1, 20, 14]} />
            <meshStandardMaterial {...bodyMaterial("upper")} />
          </mesh>
        </>
      ) : null}
      {[-1, 1].map((side) => (
        <group
          key={`arm-${side}`}
          position={[side * 0.67 * profile.shoulderScale, shoulderY - 0.88, 0]}
          rotation={[0, 0, side * -0.055]}
        >
          <mesh geometry={geometries.arm} onClick={() => select("arms")}>
            <meshStandardMaterial {...bodyMaterial("arms")} />
          </mesh>
          <mesh
            position={[0, armY(-0.04), 0]}
            scale={[0.13 * profile.armScale, 0.13, 0.12 * profile.armScale]}
            onClick={() => select("arms")}
          >
            <sphereGeometry args={[1, 20, 16]} />
            <meshStandardMaterial {...bodyMaterial("arms")} />
          </mesh>
          <mesh
            position={[0, armY(-0.95), 0]}
            scale={[0.105 * profile.armScale, 0.21, 0.075 * profile.armScale]}
            onClick={() => select("arms")}
          >
            <capsuleGeometry args={[1, 0.5, 6, 14]} />
            <meshStandardMaterial {...bodyMaterial("arms")} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group
          key={`leg-${side}`}
          position={[side * 0.27 * profile.hipScale, 0, 0]}
        >
          <mesh geometry={geometries.leg} onClick={() => select("legs")}>
            <meshStandardMaterial {...bodyMaterial("legs")} />
          </mesh>
          <mesh
            position={[0, legY(-1.17), 0.035]}
            scale={[0.18 * profile.legScale, 0.16, 0.17 * profile.legScale]}
            onClick={() => select("legs")}
          >
            <sphereGeometry args={[1, 20, 16]} />
            <meshStandardMaterial {...bodyMaterial("legs")} />
          </mesh>
          <mesh
            position={[0, legY(-2.24), 0.09]}
            scale={[0.14 * profile.calfScale, 0.1, 0.29]}
            rotation={[Math.PI / 2, 0, 0]}
            onClick={() => select("legs")}
          >
            <capsuleGeometry args={[1, 0.65, 6, 14]} />
            <meshStandardMaterial {...bodyMaterial("legs")} />
          </mesh>
        </group>
      ))}
      {!ghost && profile.definitionScale > 0.12 ? (
        <group position={[0, 0, frontDepth + 0.018]}>
          {[-1, 1].map((side) => (
            <mesh
              key={`pectoral-${side}`}
              position={[side * 0.25 * profile.chestScale, torsoY(1.52), 0]}
              scale={[0.27 * profile.chestScale, 0.16, 0.028]}
            >
              <sphereGeometry args={[1, 24, 12]} />
              <meshStandardMaterial
                color="#8f5f4d"
                transparent
                opacity={0.16 + profile.definitionScale * 0.18}
                roughness={0.76}
              />
            </mesh>
          ))}
        </group>
      ) : null}
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
              {profile.source === "photo_proportions"
                ? "A personalized illustration shaped by proportions inferred from all four scan views."
                : "A personalized illustration shaped by supported scan metrics."}{" "}
              Drag to rotate, zoom, or choose a body region for its related
              insight.
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
            {profile.source === "photo_proportions"
              ? "Photo-proportion profile"
              : "Metric-based profile"}
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
              <ambientLight intensity={1.35} />
              <directionalLight
                position={[3, 5, 5]}
                intensity={2.1}
                color="#fff1e6"
              />
              <directionalLight
                position={[-4, 1, -3]}
                intensity={1.1}
                color="#5b7fb5"
              />
              <spotLight
                position={[0, 5, -4]}
                intensity={1.8}
                angle={0.55}
                penumbra={0.9}
                color="#f0b48b"
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
                rotateSpeed={0.72}
                zoomSpeed={0.8}
              />
              <ContactShadows
                position={[0, -2.54, 0]}
                opacity={0.42}
                scale={5.4}
                blur={2.6}
                far={4}
                color="#020617"
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
                  style={{ width: `${activeInsight.score}%` }}
                />
              </div>
            ) : null}
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            Illustrative wellness visualization only. Proportions are derived
            conservatively from supported scan data; this is not a unique body
            mesh, exact anatomical measurement, diagnosis, or outcome
            prediction.
          </p>
        </div>
      </div>
    </section>
  );
}
