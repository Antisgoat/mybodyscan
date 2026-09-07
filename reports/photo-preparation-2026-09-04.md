# Original iPhone photo preparation verification

Status: local fix verified; not deployed. No paid provider requests or purchases.

Tested the four user-supplied original JPEGs with the actual `prepareScanPhoto` implementation served by Vite, using Playwright Chromium and iPhone-emulated WebKit. Also disabled Worker and createImageBitmap to exercise the HTML image fallback in WebKit. Personal photos remain outside the repository.

## Defect reproduced and corrected

JPEGs contain EXIF orientation 6. Browser decoding already applies orientation. The worker and fallback canvas pipelines applied EXIF again, causing sideways images, clipping, and black empty regions despite apparently valid output dimensions. Removed the second transform in the worker and used identity orientation for already-decoded pixels in the fallback. Explicitly requested from-image orientation for bitmap decoding.

## Results

- All four files prepared successfully in each of three paths (12 checks).
- Desktop outputs: 1200 × 1600 JPEGs, roughly 192–203 KB.
- iPhone worker outputs: 960 × 1280 JPEGs, roughly 348–363 KB.
- iPhone HTML-image fallback outputs: 960 × 1280 JPEGs, under 300 KB.
- Visually inspected corrected iPhone front, desktop back, and iPhone fallback front: upright, no additional clipping or black regions.
- Existing resize/capture unit tests: 8 passed.
- TypeScript checks: passed.

## Limits

These are preprocessing checks, not proof of successful production upload, paid analysis, plan generation, or TestFlight behavior. Actual device timings will differ. Source framing omits lower legs/feet; do not represent it as a complete full-body capture. Specific personal-account access and live provider billing availability remain unresolved. No personal diet plan was generated in this check.
