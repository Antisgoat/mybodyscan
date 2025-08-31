import { useState } from "react";
import { app } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate, Link } from "react-router-dom";

type Step = 1 | 2 | 3 | 4;

const CoachOnboarding = () => {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<any>({
    goal: "lose_fat",
    style: "ease_in",
    timeframe_weeks: 12,
    sex: "male",
    age: 30,
    height_cm: 170,
    weight_kg: 70,
    activity_level: "light",
    medical_flags: {},
    ack: { disclaimer: false },
  });
  const [plan, setPlan] = useState<any>(null);
  const navigate = useNavigate();

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function finish() {
    const functions = getFunctions(app);
    const save = httpsCallable(functions, "saveOnboarding");
    const compute = httpsCallable(functions, "computePlan");
    await save(form);
    const { data } = await compute({});
    setPlan(data);
    setStep(4);
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      {step === 1 && (
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Your goals</h1>
          <label className="block">
            Goal
            <select
              className="mt-1 w-full border p-2"
              value={form.goal}
              onChange={(e) => update("goal", e.target.value)}
            >
              <option value="lose_fat">Lose fat</option>
              <option value="gain_muscle">Gain muscle</option>
              <option value="improve_heart">Improve heart</option>
            </select>
          </label>
          <label className="block">
            Style
            <select
              className="mt-1 w-full border p-2"
              value={form.style}
              onChange={(e) => update("style", e.target.value)}
            >
              <option value="ease_in">Ease in</option>
              <option value="all_in">All in</option>
            </select>
          </label>
          <label className="block">
            Timeframe (weeks)
            <Input
              type="number"
              value={form.timeframe_weeks}
              onChange={(e) => update("timeframe_weeks", Number(e.target.value))}
            />
          </label>
          <Button onClick={() => setStep(2)}>Next</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Body stats</h2>
          <label className="block">
            Sex
            <select
              className="mt-1 w-full border p-2"
              value={form.sex}
              onChange={(e) => update("sex", e.target.value)}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className="block">
            Age
            <Input
              type="number"
              value={form.age}
              onChange={(e) => update("age", Number(e.target.value))}
            />
          </label>
          <label className="block">
            Height (cm)
            <Input
              type="number"
              value={form.height_cm}
              onChange={(e) => update("height_cm", Number(e.target.value))}
            />
          </label>
          <label className="block">
            Weight (kg)
            <Input
              type="number"
              value={form.weight_kg}
              onChange={(e) => update("weight_kg", Number(e.target.value))}
            />
          </label>
          <label className="block">
            Activity level
            <select
              className="mt-1 w-full border p-2"
              value={form.activity_level}
              onChange={(e) => update("activity_level", e.target.value)}
            >
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="very">Very</option>
              <option value="extra">Extra</option>
            </select>
          </label>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Next</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Safety & consent</h2>
          {[
            "pregnant",
            "under18",
            "eating_disorder_history",
            "heart_condition",
          ].map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.medical_flags[f] || false}
                onChange={(e) =>
                  update("medical_flags", {
                    ...form.medical_flags,
                    [f]: e.target.checked,
                  })
                }
              />
              <span>{f.replace(/_/g, " ")}</span>
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.ack.disclaimer}
              onChange={(e) =>
                update("ack", { ...form.ack, disclaimer: e.target.checked })
              }
            />
            <span>
              I accept the <Link to="/legal/disclaimer" className="underline">disclaimer</Link>
            </span>
          </label>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={finish}>Compute plan</Button>
          </div>
        </div>
      )}

      {step === 4 && plan && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Your plan</h2>
          <div className="text-sm">Target kcal: {plan.target_kcal}</div>
          <div className="flex gap-2 text-sm">
            <span>Protein {plan.protein_g}g</span>
            <span>Fat {plan.fat_g}g</span>
            <span>Carbs {plan.carbs_g}g</span>
          </div>
          {plan.needs_clearance && (
            <div className="text-red-600 text-sm">{plan.message}</div>
          )}
          <Button onClick={() => navigate("/coach/tracker")}>Start tracking</Button>
        </div>
      )}
    </div>
  );
};

export default CoachOnboarding;

