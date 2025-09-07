import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { doc, setDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});
  const navigate = useNavigate();

  function update(fields: any) {
    setForm({ ...form, ...fields });
  }

  async function finish() {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;
    await setDoc(doc(db, `users/${uid}/onboarding`), form, { merge: true });
    navigate("/today");
  }

  const steps = [
    <div className="space-y-3" key={0}>
      <Input
        placeholder="Age"
        type="number"
        onChange={(e) => update({ age: Number(e.target.value) })}
      />
      <Input
        placeholder="Sex"
        onChange={(e) => update({ sex: e.target.value })}
      />
      <Input
        placeholder="Height (cm)"
        type="number"
        onChange={(e) => update({ height: Number(e.target.value) })}
      />
    </div>,
    <div className="space-y-3" key={1}>
      <Input
        placeholder="Goal weight"
        type="number"
        onChange={(e) => update({ goalWeight: Number(e.target.value) })}
      />
      <Input
        placeholder="Timeline (months)"
        type="number"
        onChange={(e) => update({ timeline: Number(e.target.value) })}
      />
    </div>,
    <div className="space-y-3" key={2}>
      <Input
        placeholder="Equipment"
        onChange={(e) => update({ equipment: e.target.value })}
      />
      <Input
        placeholder="Injuries"
        onChange={(e) => update({ injuries: e.target.value })}
      />
    </div>,
    <div className="space-y-3" key={3}>
      <Input
        placeholder="Activities"
        onChange={(e) => update({ activities: e.target.value })}
      />
      <Input
        placeholder="Diet preferences"
        onChange={(e) => update({ diet: e.target.value })}
      />
    </div>,
    <div className="space-y-3" key={4}>
      <Input
        placeholder="Foods you like"
        onChange={(e) => update({ likes: e.target.value })}
      />
      <div className="flex items-center space-x-2">
        <Checkbox onCheckedChange={(v) => update({ notifications: v })} />
        <span>Allow notifications</span>
      </div>
    </div>,
  ];

  return (
    <div className="max-w-md mx-auto space-y-6">
      {steps[step]}
      <div className="flex gap-2">
        {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
        {step < steps.length - 1 && (
          <Button onClick={() => setStep(step + 1)}>Next</Button>
        )}
        {step === steps.length - 1 && (
          <Button onClick={finish}>Finish</Button>
        )}
      </div>
    </div>
  );
}
