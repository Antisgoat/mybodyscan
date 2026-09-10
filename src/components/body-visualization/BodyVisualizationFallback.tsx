import type {
  BodyRegionId,
  ParametricBodyProfile,
} from "@/lib/bodyVisualization";

type Props = {
  profile: ParametricBodyProfile;
  selectedRegion: BodyRegionId;
  onSelectRegion: (region: BodyRegionId) => void;
};

export function BodyVisualizationFallback({
  profile,
  selectedRegion,
  onSelectRegion,
}: Props) {
  const regionStyle = (id: BodyRegionId) => ({
    fill: selectedRegion === id ? "#67e8f9" : "#164e63",
    stroke: selectedRegion === id ? "#cffafe" : "#22d3ee",
  });

  return (
    <div className="flex min-h-[340px] items-center justify-center rounded-3xl bg-gradient-to-b from-cyan-950/30 to-black/20 p-6">
      <svg
        viewBox="0 0 220 420"
        className="h-[320px] max-w-full"
        role="img"
        aria-label="Accessible two-dimensional body visualization"
      >
        <ellipse cx="110" cy="43" rx="28" ry="34" {...regionStyle("upper")} />
        <path
          d="M70 88 Q110 68 150 88 L157 170 Q145 206 110 208 Q75 206 63 170 Z"
          {...regionStyle("upper")}
          onClick={() => onSelectRegion("upper")}
        />
        <path
          d="M63 94 Q43 105 39 150 L29 249 Q28 266 42 268 Q56 267 59 250 L74 144 Z"
          {...regionStyle("arms")}
          onClick={() => onSelectRegion("arms")}
        />
        <path
          d="M157 94 Q177 105 181 150 L191 249 Q192 266 178 268 Q164 267 161 250 L146 144 Z"
          {...regionStyle("arms")}
          onClick={() => onSelectRegion("arms")}
        />
        <path
          d="M67 160 Q110 179 153 160 L151 235 Q110 254 69 235 Z"
          {...regionStyle("core")}
          onClick={() => onSelectRegion("core")}
        />
        <path
          d="M69 232 Q110 248 151 232 L146 278 Q110 297 74 278 Z"
          {...regionStyle("hips")}
          onClick={() => onSelectRegion("hips")}
        />
        <path
          d="M76 275 L105 282 L101 393 Q98 411 82 407 Q70 403 71 388 Z"
          {...regionStyle("legs")}
          onClick={() => onSelectRegion("legs")}
        />
        <path
          d="M144 275 L115 282 L119 393 Q122 411 138 407 Q150 403 149 388 Z"
          {...regionStyle("legs")}
          onClick={() => onSelectRegion("legs")}
        />
      </svg>
      <span className="sr-only">
        Visualization height scale {profile.heightScale.toFixed(2)}.
      </span>
    </div>
  );
}
