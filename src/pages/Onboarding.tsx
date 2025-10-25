import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/components/ui/section";
import { setDoc } from "@/lib/dbWrite";
import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import HeightInputUS from "@/components/HeightInputUS";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { auth as firebaseAuth } from "@/lib/firebase";

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});
  const navigate = useNavigate();

  function update(fields: any) {
    setForm({ ...form, ...fields });
  }

  async function finish() {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const timestamp = serverTimestamp();
      await Promise.all([
        setDoc(
          doc(db, "users", uid),
          {
            onboarding: {
              ...form,
              completedAt: timestamp,
            },
          },
          { merge: true }
        ),
        setDoc(
          doc(db, `users/${uid}/meta/onboarding`),
          {
            completed: true,
            updatedAt: timestamp,
          },
          { merge: true }
        ),
      ]);
      toast({ title: "Profile complete!", description: "Welcome to MyBodyScan" });
      navigate("/home");
    } catch (err: any) {
      toast({ title: "Error saving profile", description: err?.message || "Please try again.", variant: "destructive" });
    }
  }

  const stepTitles = [
    "About You",
    "Your Goals", 
    "Equipment & Injuries",
    "Activity Preferences",
    "Diet & Notifications"
  ];

  const steps = [
    // Step 1: Age/Sex/Height
    <Section key={0} title="Tell us about yourself">
      <div className="space-y-4">
        <div>
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            placeholder="25"
            type="number"
            value={form.age || ""}
            onChange={(e) => update({ age: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="sex">Sex</Label>
          <Select value={form.sex || ""} onValueChange={(value) => update({ sex: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select sex" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Height</Label>
          <div className="mt-1">
            <HeightInputUS
              valueCm={form.height}
              onChangeCm={(cm) => update({ height: cm ?? undefined })}
            />
          </div>
        </div>
      </div>
    </Section>,
    
    // Step 2: Goal & Timeline
    <Section key={1} title="What are your goals?">
      <div className="space-y-4">
        <div>
          <Label htmlFor="goal">Primary Goal</Label>
          <Select value={form.goal || ""} onValueChange={(value) => update({ goal: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select your goal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lose-fat">Lose body fat</SelectItem>
              <SelectItem value="gain-muscle">Build muscle</SelectItem>
              <SelectItem value="maintain">Maintain current fitness</SelectItem>
              <SelectItem value="recomp">Body recomposition</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="timeline">Timeline (months)</Label>
          <Input
            id="timeline"
            placeholder="6"
            type="number"
            value={form.timeline || ""}
            onChange={(e) => update({ timeline: Number(e.target.value) })}
          />
        </div>
      </div>
    </Section>,
    
    // Step 3: Equipment & Injuries
    <Section key={2} title="Equipment & Health">
      <div className="space-y-4">
        <div>
          <Label htmlFor="equipment">Available Equipment</Label>
          <Select value={form.equipment || ""} onValueChange={(value) => update({ equipment: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select equipment access" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gym">Full gym access</SelectItem>
              <SelectItem value="home-basic">Basic home equipment</SelectItem>
              <SelectItem value="bodyweight">Bodyweight only</SelectItem>
              <SelectItem value="none">No equipment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="injuries">Injuries or Limitations</Label>
          <Input
            id="injuries"
            placeholder="e.g., Lower back, knee issues (optional)"
            value={form.injuries || ""}
            onChange={(e) => update({ injuries: e.target.value })}
          />
        </div>
      </div>
    </Section>,
    
    // Step 4: Activity Preferences  
    <Section key={3} title="Activity preferences">
      <div className="space-y-4">
        <div>
          <Label htmlFor="activities">Preferred Activities</Label>
          <Input
            id="activities"
            placeholder="e.g., Running, weight training, yoga"
            value={form.activities || ""}
            onChange={(e) => update({ activities: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="experience">Experience Level</Label>
          <Select value={form.experience || ""} onValueChange={(value) => update({ experience: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select experience level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner (0-6 months)</SelectItem>
              <SelectItem value="intermediate">Intermediate (6 months - 2 years)</SelectItem>
              <SelectItem value="advanced">Advanced (2+ years)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>,
    
    // Step 5: Diet & Notifications
    <Section key={4} title="Diet & preferences">
      <div className="space-y-4">
        <div>
          <Label htmlFor="diet">Diet Type</Label>
          <Select value={form.diet || ""} onValueChange={(value) => update({ diet: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select diet preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="low-carb">Low carb</SelectItem>
              <SelectItem value="vegetarian">Vegetarian</SelectItem>
              <SelectItem value="vegan">Vegan</SelectItem>
              <SelectItem value="keto">Ketogenic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="likes">Foods you enjoy</Label>
          <Input
            id="likes"
            placeholder="e.g., Chicken, fish, vegetables, fruits"
            value={form.likes || ""}
            onChange={(e) => update({ likes: e.target.value })}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="notifications"
            checked={form.notifications || false}
            onCheckedChange={(checked) => update({ notifications: checked })} 
          />
          <Label htmlFor="notifications">Enable scan reminders and coaching tips</Label>
        </div>
      </div>
    </Section>
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">Setup Your Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Step {step + 1} of {steps.length}: {stepTitles[step]}
          </p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>{stepTitles[step]}</CardTitle>
          </CardHeader>
          <CardContent>
            {steps[step]}
          </CardContent>
        </Card>
        
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
              Back
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} className="flex-1">
              Next
            </Button>
          ) : (
            <DemoWriteButton onClick={finish} className="flex-1">
              Complete Setup
            </DemoWriteButton>
          )}
        </div>
      </main>
    </div>
  );
}
