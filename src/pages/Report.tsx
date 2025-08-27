import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  calculateChanges,
  type UserProfile,
  type MacroBreakdown,
  type EnergyMetrics
} from "@/lib/metrics";

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
    riskLevel: 'Low' | 'Moderate' | 'High';
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
        
        let targetScanId = scanId;
        
        // If no scanId provided, get latest scan
        if (!targetScanId) {
          const scansRef = doc(db, `users/${user.uid}/scans`);
          // For simplicity, we'll require scanId - in real app would query latest
          toast({ title: "Please select a specific scan from History" });
          navigate("/history");
          return;
        }

        // Check for existing report
        const reportRef = doc(db, `users/${user.uid}/reports/${targetScanId}`);
        const reportSnap = await getDoc(reportRef);
        
        if (reportSnap.exists()) {
          setReportData(reportSnap.data() as ReportData);
          setLoading(false);
          return;
        }

        // Generate new report
        const scanRef = doc(db, `users/${user.uid}/scans/${targetScanId}`);
        const scanSnap = await getDoc(scanRef);
        
        if (!scanSnap.exists()) {
          setError("Scan not found");
          setLoading(false);
          return;
        }

        const scanData = scanSnap.data();
        const results = scanData?.results;
        
        if (!results?.bodyFatPct || !results?.weightLb) {
          setError("Insufficient scan data for report generation");
          setLoading(false);
          return;
        }

        // Mock user profile - in real app would come from user settings
        const userProfile: UserProfile = {
          weightLbs: results.weightLb,
          heightIn: 70, // Mock height - would come from user profile
          age: 30, // Mock age - would come from user profile
          gender: 'male', // Mock gender - would come from user profile
          activityFactor: 1.4
        };

        // Calculate body composition
        const { leanMassLbs, fatMassLbs } = bodyComposition({
          weightLbs: results.weightLb,
          bodyFatPct: results.bodyFatPct
        });

        // Calculate energy metrics
        const energy = calculateEnergyMetrics(userProfile, leanMassLbs);

        // Calculate macros for each target
        const macros = {
          cut: macroPlan({ 
            calories: energy.cutCalories, 
            lbmLbs: leanMassLbs, 
            weightLbs: results.weightLb 
          }),
          maintain: macroPlan({ 
            calories: energy.maintainCalories, 
            lbmLbs: leanMassLbs, 
            weightLbs: results.weightLb 
          }),
          gain: macroPlan({ 
            calories: energy.gainCalories, 
            lbmLbs: leanMassLbs, 
            weightLbs: results.weightLb 
          })
        };

        // Mock measurements - in real app would come from scan analysis
        const measurements = {
          waistIn: 32.0,
          hipIn: 38.0,
          chestIn: 42.0,
          thighIn: 24.0,
          armIn: 14.0
        };

        let waistRatio;
        if (measurements.waistIn) {
          waistRatio = waistHeightRatio(measurements.waistIn, userProfile.heightIn);
        }

        const newReportData: ReportData = {
          scanId: targetScanId,
          weightLbs: results.weightLb,
          bodyFatPct: results.bodyFatPct,
          leanMassLbs,
          fatMassLbs,
          energy,
          macros,
          measurements,
          waistHeightRatio: waistRatio,
          changes: null, // Would calculate from previous scan
          generatedAt: new Date()
        };

        // Save report to Firestore
        await setDoc(reportRef, newReportData);
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
            <p className="text-2xl font-bold">{reportData.bodyFatPct.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">Body Fat</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{reportData.leanMassLbs.toFixed(1)} lbs</p>
            <p className="text-sm text-muted-foreground">Lean Mass</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{reportData.fatMassLbs.toFixed(1)} lbs</p>
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
              <p className="text-sm text-muted-foreground">BMR (Basal Metabolic Rate)</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{energy.tdee} kcal/day</p>
              <p className="text-sm text-muted-foreground">TDEE (Total Daily Energy)</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-red-50">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-red-700">{energy.cutCalories}</p>
                <p className="text-sm text-red-600">Cut (kcal/day)</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-blue-700">{energy.maintainCalories}</p>
                <p className="text-sm text-blue-600">Maintain (kcal/day)</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="p-4 text-center">
                <p className="text-xl font-bold text-green-700">{energy.gainCalories}</p>
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
            
            {(['cut', 'maintain', 'gain'] as const).map((target) => (
              <TabsContent key={target} value={target}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">{macros[target].proteinG}g</p>
                    <p className="text-sm text-muted-foreground">Protein</p>
                    <p className="text-xs text-muted-foreground">({macros[target].proteinKcal} kcal)</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">{macros[target].fatG}g</p>
                    <p className="text-sm text-muted-foreground">Fat</p>
                    <p className="text-xs text-muted-foreground">({macros[target].fatKcal} kcal)</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">{macros[target].carbsG}g</p>
                    <p className="text-sm text-muted-foreground">Carbs</p>
                    <p className="text-xs text-muted-foreground">({macros[target].carbsKcal} kcal)</p>
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
                <p className="text-muted-foreground">{formatMeasurement(reportData.measurements.waistIn)}</p>
              </div>
              <div>
                <p className="font-medium">Hip</p>
                <p className="text-muted-foreground">{formatMeasurement(reportData.measurements.hipIn)}</p>
              </div>
              <div>
                <p className="font-medium">Chest</p>
                <p className="text-muted-foreground">{formatMeasurement(reportData.measurements.chestIn)}</p>
              </div>
              <div>
                <p className="font-medium">Thigh</p>
                <p className="text-muted-foreground">{formatMeasurement(reportData.measurements.thighIn)}</p>
              </div>
              <div>
                <p className="font-medium">Arm</p>
                <p className="text-muted-foreground">{formatMeasurement(reportData.measurements.armIn)}</p>
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
                <p className="text-2xl font-bold">{reportData.waistHeightRatio.ratio.toFixed(3)}</p>
                <p className="text-sm text-muted-foreground">Ratio</p>
              </div>
              <Badge variant={
                reportData.waistHeightRatio.riskLevel === 'Low' ? 'default' :
                reportData.waistHeightRatio.riskLevel === 'Moderate' ? 'secondary' : 'destructive'
              }>
                {reportData.waistHeightRatio.riskLevel} Risk
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="text-center text-sm text-muted-foreground pt-4 border-t">
        <p>Image-based estimates are approximations, not medical diagnostics.</p>
      </div>
    </div>
  );
}