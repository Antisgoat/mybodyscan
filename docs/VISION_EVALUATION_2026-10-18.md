# Live vision evaluation — October 18, 2026

This is a small release smoke evaluation, not a measured population accuracy claim.
The evaluation called the real OpenAI API with the production feature prompts,
validators, and model routing. It did not exercise iPhone camera permissions,
subscriptions, or the authenticated Firebase callable transport.

## Inputs and observations

The sample images came from Wikimedia Commons and remain outside the repository:

- [Refrigerator](https://commons.wikimedia.org/wiki/File:Open_refrigerator_with_food_at_night.jpg)
- [Gym](https://commons.wikimedia.org/wiki/File:This_gym_room_showcases_various_workout_machines.jpg)
- [Meal](https://commons.wikimedia.org/wiki/File:Rice,_with_Chicken_Veggies.jpg)

The meal image visibly contains rice, vegetables, mixed meat pieces, salad, and a
yogurt container. Its title is not reliable ground truth for the exact meat type.
The test supplied a chicken hint deliberately; the result reported that chicken
was not clearly identifiable and described sausage/ham-like pieces instead.
It retained a low confidence of 0.48 and called out uncertain portions, oils,
sauces, and hidden ingredients. The low-confidence Sol pass escalated to Astra.
This is the intended review behavior, not a verified calorie measurement.

The refrigerator result identified tomatoes, green grapes, carrots, oranges,
lemon, and cheese. Pickles and eggs remained uncertain. Unlabeled bottles, cans,
jars, and covered dishes were not assigned invented contents. Three meal ideas
passed the confirmed-ingredient and permitted-staple validators. In the test,
reviewable detections were automatically confirmed to exercise the next step;
the actual product requires the member to confirm them.

The gym result identified a stationary bike, dumbbells, a multi-gym, its
lat-pulldown attachment, and its leg-extension attachment. It did not invent a
barbell, squat rack, treadmill, hack squat, or belt squat. Mirror reflections
were not counted twice. These findings matched visual inspection.

The complete parallel evaluation, including three meal ideas and the optional
meal escalation, took about 26.6 seconds. Five provider calls returned HTTP 200
with token usage logged. This sample is too small to establish typical latency
or monthly operating cost.

## Repeatable evaluation

Run `npm run eval:vision -- --meal <JPEG> --fridge <image> --gym <image>` with a
server-side `OPENAI_API_KEY` available. This command spends API credit; it is
intentionally excluded from ordinary automated tests. Never place keys, private
photos, or raw user outputs in the repository. The script validates response
shapes and obvious sample components; a reviewer must still compare detections
with the input images. Image copyright must be checked before redistribution.

## Remaining acceptance

Physical iPhone tests must cover camera capture, photo library, gym video
decoding, login, paid access, restore purchases, and deletion. The current 3D
body is an illustration, not a unique photo-reconstructed mesh or DEXA result.
Broader labeled test sets are required before advertising accuracy percentages.
