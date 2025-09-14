import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Check } from "lucide-react";
import { auth, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";
import { v4 as uuidv4 } from "uuid";
import { useSpendCredit } from "@/hooks/useSpendCredit";

type PhotoType = "front" | "back" | "left" | "right";
type Stage = "capture" | "uploading" | "processing";

const photoSteps: { key: PhotoType; label: string; description: string }[] = [
  { key: "front", label: "Front View", description: "Face the camera, arms at sides" },
  { key: "back", label: "Back View", description: "Turn around, arms at sides" },
  { key: "left", label: "Left Side", description: "Turn left, profile view" },
  { key: "right", label: "Right Side", description: "Turn right, profile view" }
];

export default function PhotoCaptureNew() {
  const [photos, setPhotos] = useState<Record<PhotoType, File | null>>({
    front: null, back: null, left: null, right: null
  });
  const [currentStep, setCurrentStep] = useState<PhotoType>("front");
  const [stage, setStage] = useState<Stage>("capture");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { spend } = useSpendCredit();

  const currentStepIndex = photoSteps.findIndex(s => s.key === currentStep);
  const allPhotosComplete = photoSteps.every(step => photos[step.key] !== null);

  const handlePhotoCapture = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";

    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        setPhotos(prev => ({ ...prev, [currentStep]: file }));
        
        // Auto-advance to next step
        if (currentStepIndex < photoSteps.length - 1) {
          setCurrentStep(photoSteps[currentStepIndex + 1].key);
        }
      }
    };

    input.click();
  };

  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        setPhotos(prev => ({ ...prev, [currentStep]: file }));
        
        // Auto-advance to next step
        if (currentStepIndex < photoSteps.length - 1) {
          setCurrentStep(photoSteps[currentStepIndex + 1].key);
        }
      }
    };

    input.click();
  };

  const retakePhoto = (photoType: PhotoType) => {
    setPhotos(prev => ({ ...prev, [photoType]: null }));
    setCurrentStep(photoType);
  };

  const processScans = async () => {
    if (!auth.currentUser || !allPhotosComplete) return;

    try {
      setStage("uploading");

      // Spend credit first
      try {
        await spend("4-photo scan");
        toast({ title: "Credit used", description: "Processing your scan..." });
      } catch (err: any) {
        toast({ title: "Insufficient credits", description: "Please purchase more credits to continue.", variant: "destructive" });
        navigate("/plans");
        return;
      }

      const scanId = uuidv4();
      const uid = auth.currentUser.uid;
      const photoPaths: Record<PhotoType, string> = {} as any;

      // Upload all photos
      for (const step of photoSteps) {
        const file = photos[step.key]!;
        const fileExt = file.name.split('.').pop() || 'jpg';
        const storageRef = ref(storage, `users/${uid}/scans/${scanId}/original_${step.key}.${fileExt}`);
        
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        photoPaths[step.key] = downloadUrl;
      }

      setStage("processing");

      // Create scan document
      const scanDoc = {
        uid,
        status: "processing",
        photos: photoPaths,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", uid, "scans", scanId), scanDoc);

      // Navigate to processing page
      navigate(`/processing/${scanId}`);

    } catch (error) {
      console.error("Scan processing error:", error);
      setStage("capture");
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  if (stage === "uploading" || stage === "processing") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Seo title="Processing Scan - MyBodyScan" description="Processing your body scan photos" />
        
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <h1 className="text-2xl font-bold">
            {stage === "uploading" ? "Uploading Photos..." : "Processing Scan..."}
          </h1>
          <p className="text-muted-foreground">
            {stage === "uploading" 
              ? "Securely uploading your photos to our servers" 
              : "Analyzing your photos for body composition"
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Seo
        title="4-Photo Scan - MyBodyScan"
        description="Capture 4 photos for accurate body composition analysis"
      />

      <div>
        <h1 className="text-3xl font-bold mb-2">4-Photo Body Scan</h1>
        <p className="text-muted-foreground">
          Take 4 photos from different angles for the most accurate results
        </p>
      </div>

      {/* Progress indicators */}
      <div className="flex justify-between mb-6">
        {photoSteps.map((step, index) => (
          <div key={step.key} className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              photos[step.key] ? 'bg-green-500 text-white' : 
              step.key === currentStep ? 'bg-primary text-primary-foreground' : 
              'bg-muted text-muted-foreground'
            }`}>
              {photos[step.key] ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            <span className="text-xs mt-1 text-center">{step.label}</span>
          </div>
        ))}
      </div>

      {/* Current step capture */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Step {currentStepIndex + 1}: {photoSteps[currentStepIndex].label}
            {photos[currentStep] && (
              <Badge variant="secondary" className="text-green-600">Complete</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {photoSteps[currentStepIndex].description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!photos[currentStep] ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={handlePhotoCapture}
                className="h-24 flex flex-col gap-2"
                variant="outline"
              >
                <Camera className="h-6 w-6" />
                Use Camera
              </Button>
              <Button
                onClick={handleFileUpload}
                className="h-24 flex flex-col gap-2"
                variant="outline"
              >
                <Upload className="h-6 w-6" />
                Choose File
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <img
                  src={URL.createObjectURL(photos[currentStep]!)}
                  alt={`${currentStep} view`}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => retakePhoto(currentStep)} variant="outline">
                  Retake Photo
                </Button>
                {currentStepIndex < photoSteps.length - 1 && (
                  <Button onClick={() => setCurrentStep(photoSteps[currentStepIndex + 1].key)}>
                    Next Step
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button 
          onClick={() => currentStepIndex > 0 && setCurrentStep(photoSteps[currentStepIndex - 1].key)}
          variant="outline"
          disabled={currentStepIndex === 0}
        >
          Previous
        </Button>
        
        {allPhotosComplete ? (
          <Button onClick={processScans} className="bg-green-600 hover:bg-green-700">
            Process Scan (Uses 1 Credit)
          </Button>
        ) : (
          <Button 
            onClick={() => currentStepIndex < photoSteps.length - 1 && setCurrentStep(photoSteps[currentStepIndex + 1].key)}
            disabled={currentStepIndex === photoSteps.length - 1}
          >
            Next
          </Button>
        )}
      </div>

      {/* Tips */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium mb-2">Photography Tips:</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Use good lighting - avoid shadows</li>
            <li>• Stand 6-8 feet from the camera</li>
            <li>• Wear form-fitting clothing</li>
            <li>• Keep arms slightly away from body</li>
            <li>• Stand up straight and look forward</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}