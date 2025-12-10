/**
 * Pipeline map — Scan prep guidance:
 * - Offers static photo-taking tips so users pass the capture gate before uploads.
 * - Reinforces the need for the 4 poses that `ScanCapture` enforces, improving downstream OpenAI analysis quality.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks, SunMedium, Scan, Users } from "lucide-react";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";

const tips = [
  "Stand on a marker about 8 feet from the camera",
  "Use bright, even lighting with minimal shadows",
  "Wear fitted clothing and remove accessories",
  "Keep arms slightly away from the torso",
  "Frame head to toe with a neutral background",
];

const silhouettes = [
  { label: "Front", description: "Feet together, arms out" },
  { label: "Side", description: "Turn 90°, head forward" },
  { label: "Back", description: "Relaxed shoulders" },
];

export default function ScanTips() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
      <Seo title="Photo Tips" description="Improve photo scan accuracy" />
      <NotMedicalAdviceBanner />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Photo Tips</h1>
        <p className="text-muted-foreground">
          Better lighting, distance, and framing lead to more accurate body-fat estimates. Follow this checklist before each
          scan.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" /> Checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-6 text-sm text-muted-foreground">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SunMedium className="h-5 w-5 text-primary" /> Lighting & Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Face a window or soft light source. Avoid overhead lights that cast harsh shadows. If possible, ask someone to take
            the photos or use a tripod at chest height.
          </p>
          <p>
            Mark a standing spot with tape so each scan uses the same distance. A consistent setup improves comparisons over time.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5 text-primary" /> Poses
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {silhouettes.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-2">
              <div className="flex h-32 w-24 items-end justify-center rounded-lg border bg-muted">
                <div className="h-28 w-6 rounded-full bg-gradient-to-t from-primary/70 to-primary/30" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Need help?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Share these tips with whoever is taking your photos. For the best accuracy, retake any photo that fails the gate or
          looks blurry before submitting your scan.
        </CardContent>
      </Card>
    </main>
  );
}
