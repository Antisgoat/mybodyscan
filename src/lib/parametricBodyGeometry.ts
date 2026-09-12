import { BufferGeometry, Float32BufferAttribute } from "three";

export type BodyLoftSection = {
  y: number;
  radiusX: number;
  radiusZ: number;
  centerX?: number;
  centerZ?: number;
};

/**
 * Builds a smooth elliptical surface through measured cross-sections. Unlike
 * stacked primitives, the resulting silhouette is continuous and reacts to
 * width and depth independently in every view.
 */
export function createBodyLoftGeometry(
  sections: BodyLoftSection[],
  radialSegments = 32,
  subdivisions = 4
): BufferGeometry {
  if (sections.length < 2) {
    throw new Error("A body loft requires at least two cross-sections.");
  }

  const segments = Math.max(12, Math.floor(radialSegments));
  const verticalSubdivisions = Math.max(1, Math.floor(subdivisions));
  const sampleScalar = (
    key: "radiusX" | "radiusZ" | "centerX" | "centerZ",
    index: number,
    progress: number
  ) => {
    const start = sections[index][key] ?? 0;
    const end = sections[index + 1][key] ?? 0;
    const eased = progress * progress * (3 - 2 * progress);
    return start + (end - start) * eased;
  };
  const sampledSections: BodyLoftSection[] = [];
  for (let index = 0; index < sections.length - 1; index += 1) {
    for (let step = 0; step < verticalSubdivisions; step += 1) {
      const progress = step / verticalSubdivisions;
      sampledSections.push({
        y:
          sections[index].y +
          (sections[index + 1].y - sections[index].y) * progress,
        radiusX: Math.max(0.01, sampleScalar("radiusX", index, progress)),
        radiusZ: Math.max(0.01, sampleScalar("radiusZ", index, progress)),
        centerX: sampleScalar("centerX", index, progress),
        centerZ: sampleScalar("centerZ", index, progress),
      });
    }
  }
  sampledSections.push(sections[sections.length - 1]);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  sampledSections.forEach((section, sectionIndex) => {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(
        (section.centerX ?? 0) + Math.sin(angle) * section.radiusX,
        section.y,
        (section.centerZ ?? 0) + Math.cos(angle) * section.radiusZ
      );
      uvs.push(segment / segments, sectionIndex / (sampledSections.length - 1));
    }
  });

  for (let section = 0; section < sampledSections.length - 1; section += 1) {
    const current = section * segments;
    const next = (section + 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments;
      indices.push(
        current + segment,
        next + segment,
        next + following,
        current + segment,
        next + following,
        current + following
      );
    }
  }

  const addCap = (sectionIndex: number, reverse: boolean) => {
    const section = sampledSections[sectionIndex];
    const centerIndex = positions.length / 3;
    positions.push(section.centerX ?? 0, section.y, section.centerZ ?? 0);
    uvs.push(0.5, reverse ? 0 : 1);
    const ringStart = sectionIndex * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const following = (segment + 1) % segments;
      if (reverse) {
        indices.push(centerIndex, ringStart + following, ringStart + segment);
      } else {
        indices.push(centerIndex, ringStart + segment, ringStart + following);
      }
    }
  };

  addCap(0, true);
  addCap(sampledSections.length - 1, false);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
