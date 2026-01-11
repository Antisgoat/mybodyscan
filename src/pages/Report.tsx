import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { setDoc } from "@/lib/dbWrite";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/auth/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  calculateEnergyMetrics,
  bodyComposition,
  macroPlan,
  waistHeightRatio,
  formatMeasurement,
  type UserProfile,
  type MacroBreakdown,
  type EnergyMetrics,
} from "@/lib/metrics";
import { extractScanMetrics } from "@/lib/scans";
import { DEMO_MODE } from "@/env";

interface ReportData {
  scanId: string;
  weightLbs: number;
  bodyFatPct: number;
  leanMassLbs: number;
  fatMassLbs: number;
  energy: EnergyMetrics;
  macros: {
    cut: MacroBreakdown;
    maintain: MacroBreakdown;
    gain: MacroBreakdown;
  };
  measurements?: {
    waistIn?: number;
    hipIn?: number;
    chestIn?: number;
    thighIn?: number;
    armIn?: number;
  };
  waistHeightRatio?: {
    ratio: number;
    riskLevel: "Low" | "Moderate" | "High";
  };
  changes?: {
    deltaWeight: number | null;
    deltaBF: number | null;
    deltaWaist: number | null;
  } | null;
  generatedAt: Date;
}

export default function Report() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    const loadReport = async () => {
      try {
        setLoading(true);
        setError(null);

        const scansCollection = collection(db, "users", user.uid, "scans");

        const findLatestCompleted = async () => {
          const snapshot = await getDocs(
            query(scansCollection, orderBy("completedAt", "desc"), limit(5))
          );
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const metrics = extractScanMetrics(data);
            const status = (data?.status as string | undefined) || null;
            if (
              metrics.bodyFatPercent != null &&
              data?.charged &&
              (status === "completed" ||
                status === "complete" ||
                status === "done")
            ) {
              return { id: docSnap.id, data };
            }
          }
          return null;
        };

        const redirectToHistory = (message: {
          title: string;
          description?: string;
        }) => {
          toast(message);
          navigate("/history", { replace: true });
        };

        const targetScanId = scanId ?? null;

        if (!targetScanId) {
          const latest = await findLatestCompleted();
          if (latest) {
            toast({
              title: "Showing latest scan",
              description: "We loaded your most recent completed scan report.",
            });
            navigate(`/report/${latest.id}`, { replace: true });
          } else {
            redirectToHistory({
              title: "No completed scans",
              description: "Complete a scan to generate a report.",
            });
          }
          return;
        }

        const reportRef = doc(db, "users", user.uid, "reports", targetScanId);
        let reportSnap;
        try {
          reportSnap = await getDoc(reportRef);
        } catch (error) {
          console.warn("report.loadReportDoc", error);
          setError("Unable to load report");
          setLoading(false);
          return;
        }

        if (reportSnap.exists()) {
          setReportData(reportSnap.data() as ReportData);
          return;
        }

        const scanRef = doc(db, "users", user.uid, "scans", targetScanId);
        let scanSnap;
        try {
          scanSnap = await getDoc(scanRef);
        } catch (error) {
          console.warn("report.loadScanDoc", error);
          scanSnap = null;
        }

        if (!scanSnap?.exists()) {
          const latest = await findLatestCompleted();
          if (latest) {
            toast({
              title: "Scan not found",
              description: "Showing your most recent completed scan instead.",
            });
            navigate(`/report/${latest.id}`, { replace: true });
          } else {
            redirectToHistory({
              title: "Scan not found",
              description: "Complete a scan to view reports.",
            });
          }
          return;
        }

        const scanData = scanSnap.data();
        const metrics = extractScanMetrics(scanData);
        const bodyFatPct = metrics.bodyFatPercent;
        const weightLbs = metrics.weightLb;

        if (bodyFatPct == null || weightLbs == null) {
          setError("Insufficient scan data for report generation");
          return;
        }

        const userProfile: UserProfile = {
          weightLbs,
          heightIn: 70,
          age: 30,
          gender: "male",
          activityFactor: 1.4,
        };

        const { leanMassLbs, fatMassLbs } = bodyComposition({
          weightLbs,
          bodyFatPct,
        });

        const energy = calculateEnergyMetrics(userProfile, leanMassLbs);

        const macros = {
          cut: macroPlan({
            calories: energy.cutCalories,
            lbmLbs: leanMassLbs,
            weightLbs,
          }),
          maintain: macroPlan({
            calories: energy.maintainCalories,
            lbmLbs: leanMassLbs,
            weightLbs,
          }),
          gain: macroPlan({
            calories: energy.gainCalories,
            lbmLbs: leanMassLbs,
            weightLbs,
          }),
        };

        const measurements = {
          waistIn: 32.0,
          hipIn: 38.0,
          chestIn: 42.0,
          thighIn: 24.0,
          armIn: 14.0,
        };

        let waistRatio;
        if (measurements.waistIn) {
          waistRatio = waistHeightRatio(
            measurements.waistIn,
            userProfile.heightIn
          );
        }

        const newReportData: ReportData = {
          scanId: targetScanId,
          weightLbs,
          bodyFatPct,
          leanMassLbs,
          fatMassLbs,
          energy,
          macros,
          measurements,
          waistHeightRatio: waistRatio,
          changes: null,
          generatedAt: new Date(),
        };

        if (!DEMO_MODE) {
          await setDoc(reportRef, newReportData);
        }
        setReportData(newReportData);
      } catch (err: any) {
        console.error("Error loading report:", err);
        setError(err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [user?.uid, scanId, navigate]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600">{error || "Report not available"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { energy, macros } = reportData;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold">Pro Report</h1>
        <p className="text-muted-foreground mt-2">
          Generated {reportData.generatedAt.toLocaleDateString()}
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{reportData.weightLbs} lbs</p>
            <p className="text-sm text-muted-foreground">Weight</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {Number.isFinite(reportData.bodyFatPct)
                ? `${reportData.bodyFatPct.toFixed(1)}%`
                : "—"}
            </p>
            <p className="text-sm text-muted-foreground">Body Fat</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {Number.isFinite(reportData.leanMassLbs)
                ? `${reportData.leanMassLbs.toFixed(1)} lbs`
                : "—"}
            </p>
            <p className="text-sm text-muted-foreground">Lean Mass</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {Number.isFinite(reportData.fatMassLbs)
                ? `${reportData.fatMassLbs.toFixed(1)} lbs`
                : "—"}
            </p>
            <p className="text-sm text-muted-foreground">Fat Mass</p>
          </CardContent>
        </Card>
      </div>

      {/* Energy Section */}
      <Card>
        <CardHeader>
          <CardTitle>Energy & Calories</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <p className="text-lg font-semibold">{energy.bmr} kcal/day</p>
              <p className="text-sm text-muted-foreground">
                BMR (Basal Metabolic Rate)
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{energy.tdee} kcal/day</p>
              <p className="text-sm text-muted-foreground">
                TDEE (Total Daily Energy)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-red-50">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-red-700">
                  {energy.cutCalories}
                </p>
                <p className="text-sm text-red-600">Cut (kcal/day)</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-blue-700">
                  {energy.maintainCalories}
                </p>
                <p className="text-sm text-blue-600">Maintain (kcal/day)</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-green-700">
                  {energy.gainCalories}
                </p>
                <p className="text-sm text-green-600">Gain (kcal/day)</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Macros Section */}
      <Card>
        <CardHeader>
          <CardTitle>Macro Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="maintain" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cut">Cut</TabsTrigger>
              <TabsTrigger value="maintain">Maintain</TabsTrigger>
              <TabsTrigger value="gain">Gain</TabsTrigger>
            </TabsList>

            {(["cut", "maintain", "gain"] as const).map((target) => (
              <TabsContent key={target} value={target}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">
                      {macros[target].proteinG}g
                    </p>
                    <p className="text-sm text-muted-foreground">Protein</p>
                    <p className="text-xs text-muted-foreground">
                      ({macros[target].proteinKcal} kcal)
                    </p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">{macros[target].fatG}g</p>
                    <p className="text-sm text-muted-foreground">Fat</p>
                    <p className="text-xs text-muted-foreground">
                      ({macros[target].fatKcal} kcal)
                    </p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">
                      {macros[target].carbsG}g
                    </p>
                    <p className="text-sm text-muted-foreground">Carbs</p>
                    <p className="text-xs text-muted-foreground">
                      ({macros[target].carbsKcal} kcal)
                    </p>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Measurements Section */}
      {reportData.measurements && (
        <Card>
          <CardHeader>
            <CardTitle>Measurements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="font-medium">Waist</p>
                <p className="text-muted-foreground">
                  {formatMeasurement(reportData.measurements.waistIn)}
                </p>
              </div>
              <div>
                <p className="font-medium">Hip</p>
                <p className="text-muted-foreground">
                  {formatMeasurement(reportData.measurements.hipIn)}
                </p>
              </div>
              <div>
                <p className="font-medium">Chest</p>
                <p className="text-muted-foreground">
                  {formatMeasurement(reportData.measurements.chestIn)}
                </p>
              </div>
              <div>
                <p className="font-medium">Thigh</p>
                <p className="text-muted-foreground">
                  {formatMeasurement(reportData.measurements.thighIn)}
                </p>
              </div>
              <div>
                <p className="font-medium">Arm</p>
                <p className="text-muted-foreground">
                  {formatMeasurement(reportData.measurements.armIn)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Waist/Height Ratio */}
      {reportData.waistHeightRatio && (
        <Card>
          <CardHeader>
            <CardTitle>Waist-to-Height Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">
                  {Number.isFinite(reportData.waistHeightRatio.ratio)
                    ? reportData.waistHeightRatio.ratio.toFixed(3)
                    : "—"}
                </p>
                <p className="text-sm text-muted-foreground">Ratio</p>
              </div>
              <Badge
                variant={
                  reportData.waistHeightRatio.riskLevel === "Low"
                    ? "default"
                    : reportData.waistHeightRatio.riskLevel === "Moderate"
                      ? "secondary"
                      : "destructive"
                }
              >
                {reportData.waistHeightRatio.riskLevel} Risk
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="text-center text-sm text-muted-foreground pt-4 border-t">
        <p>
          Image-based estimates are approximations, not medical diagnostics.
        </p>
      </div>
    </div>
  );
}
