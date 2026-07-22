# MBS Product Insight methodology

MBS Product Insight is MyBodyScan's original packaged-food comparison tool. It is not affiliated with, endorsed by, or modeled on any third-party consumer-rating application. The name, labels, presentation, and formula are specific to MyBodyScan.

## What it does

When enough product data is available, Product Insight produces a score from 0 to 100 on a standardized **per 100 g** basis. The result is intended to help a user compare packaged foods; it is not a diagnosis, medical recommendation, regulatory nutrient-content claim, or determination that a product is safe or unsafe.

The formula starts at 80 points and applies the following capped adjustments:

| Factor                                                      | Maximum adjustment | Reference used to reach the cap |
| ----------------------------------------------------------- | -----------------: | ------------------------------: |
| Dietary fiber                                               |                +12 |                       7 g/100 g |
| Protein                                                     |                 +8 |                      20 g/100 g |
| Saturated fat                                               |                -15 |                      10 g/100 g |
| Sodium                                                      |                -15 |                  1,150 mg/100 g |
| Added sugar, or total sugar when added sugar is unavailable |                -15 |                      25 g/100 g |
| Trans fat                                                   |                 -5 |                       2 g/100 g |

Each adjustment scales linearly from zero to its cap. The final result is rounded and constrained to 0–100. Additives, allergens, processing classifications, brands, marketing claims, and price do not change the score. They may be displayed separately as factual product-data disclosures.

The score labels are:

- 80–100: Strong
- 65–79: Balanced
- 45–64: Mixed
- 0–44: Limited

These are MBS comparison labels, not FDA-defined claims.

## Data sufficiency and confidence

The five core fields are calories, saturated fat, sodium, sugars, and fiber. A score is withheld if fewer than three core fields are available. Confidence is:

- **High:** all five core fields and an ingredient list are available.
- **Medium:** enough core fields exist to calculate a score, but one or more fields or the ingredient list is missing.
- **Low:** the product cannot be scored.

Missing added-sugar data is never assumed to be zero. If total sugar is available instead, the UI identifies it as total sugar.

## Higher-scoring alternatives

When Open Food Facts supplies sufficient evidence, MyBodyScan may show up to
three alternatives. Every displayed alternative must share at least one
declared product category with the scanned item, have enough nutrient data for
the published MBS Product Insight calculation, and score strictly higher under
that same formula. The current item is excluded, candidates are sorted by the
calculated score, and no alternative is shown when category or nutrient data is
too incomplete to support the comparison.

Alternatives are suggestions for comparison, not claims that a food is safe,
healthy for every person, medically appropriate, cheaper, or nutritionally
superior in every respect. The UI must identify the shared-category basis and
keep the score factors available to the user.

## Public guidance and data sources

The formula is informed by the FDA's general guidance to choose foods higher in dietary fiber and lower in saturated fat, sodium, and added sugars. FDA Daily Values include 28 g fiber, 20 g saturated fat, 2,300 mg sodium, 50 g added sugars, and 50 g protein for adults and children age four and older. The MBS per-100-g caps above are an original comparison system and are not FDA Daily Value calculations.

- FDA, [Daily Value on the Nutrition and Supplement Facts Labels](https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels)
- FDA, [Added Sugars on the Nutrition Facts Label](https://www.fda.gov/food/nutrition-facts-label/added-sugars-nutrition-facts-label)
- FDA, [Serving Size on the Nutrition Facts Label](https://www.fda.gov/food/nutrition-facts-label/serving-size-nutrition-facts-label)

Product information can come from USDA FoodData Central and Open Food Facts. Open Food Facts database use requires attribution and is subject to the Open Database License (ODbL); images and individual contents may have separate licenses. Product-data exports or derivative databases must be reviewed for applicable share-alike obligations before distribution.

- [USDA FoodData Central](https://fdc.nal.usda.gov/)
- [Open Food Facts data reuse](https://world.openfoodfacts.org/data)

## Product and legal safeguards

- Do not describe the score as a medical, clinical, FDA, safety, toxicity, or disease-risk score.
- Do not state that an additive is harmful merely because it appears in the product record.
- Always show missing-data status and encourage checking the physical label.
- Keep score factors visible so users can understand every adjustment.
- Do not use a competitor's trademarks, grading labels, trade dress, copy, icons, or proprietary methodology.
- Do not advertise Product Insight as a clone, replacement, or version of a
  named competitor; describe the functionality and the published MyBodyScan
  methodology on their own terms.
- Obtain counsel review of naming, marketing claims, data licensing, privacy, and launch territories before public release.

Methodology version: **MBS-PI 1.0**.
