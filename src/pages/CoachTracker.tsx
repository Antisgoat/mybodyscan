import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { format, subDays } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUserProfile } from "@/hooks/useUserProfile";

const CoachTracker = () => {
  const { plan } = useUserProfile();
  const uid = auth.currentUser?.uid;
  const today = format(new Date(), "yyyy-MM-dd");
  const [log, setLog] = useState({
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  });
  const [chart, setChart] = useState<any[]>([]);
  const [yesterday, setYesterday] = useState<any>(null);
  const [offset, setOffset] = useState(false);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", uid, "nutritionLogs", today));
      if (snap.exists()) {
        setLog({
          calories: snap.data().calories || 0,
          protein_g: snap.data().protein_g || 0,
          carbs_g: snap.data().carbs_g || 0,
          fat_g: snap.data().fat_g || 0,
        });
      }
    })();
  }, [uid, today]);

  async function save() {
    if (!uid) return;
    const ref = doc(db, "users", uid, "nutritionLogs", today);
    await setDoc(ref, { ...log, updatedAt: serverTimestamp() }, { merge: true });
    await loadChart();
  }

  async function loadChart() {
    if (!uid) return;
    const arr: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = format(subDays(new Date(), i), "yyyy-MM-dd");
      const snap = await getDoc(doc(db, "users", uid, "nutritionLogs", day));
      arr.push({ date: day, calories: snap.exists() ? snap.data().calories || 0 : 0 });
    }
    setChart(arr);
    const yDay = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const ySnap = await getDoc(doc(db, "users", uid, "healthDaily", yDay));
    if (ySnap.exists()) setYesterday(ySnap.data());
  }

  useEffect(() => {
    loadChart().catch(() => {});
  }, [uid]);

  const total = log.calories || 0;
  const target = plan?.target_kcal || 0;
  const adjusted = offset ? target + (yesterday?.activeEnergyKcal || 0) : target;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Calorie Tracker</h1>
      <div>Target: {target} kcal {offset && `(adjusted ${adjusted})`}</div>
      {yesterday?.activeEnergyKcal && (
        <div className="text-sm">Yesterday burn: {yesterday.activeEnergyKcal} kcal</div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={offset} onCheckedChange={setOffset} />
        Experimental: offset calories by activity
      </label>
      <div className="space-y-2">
        <Input
          type="number"
          value={log.calories}
          onChange={(e) => setLog({ ...log, calories: Number(e.target.value) })}
          placeholder="Calories"
        />
        <Input
          type="number"
          value={log.protein_g}
          onChange={(e) => setLog({ ...log, protein_g: Number(e.target.value) })}
          placeholder="Protein g"
        />
        <Input
          type="number"
          value={log.carbs_g}
          onChange={(e) => setLog({ ...log, carbs_g: Number(e.target.value) })}
          placeholder="Carbs g"
        />
        <Input
          type="number"
          value={log.fat_g}
          onChange={(e) => setLog({ ...log, fat_g: Number(e.target.value) })}
          placeholder="Fat g"
        />
        <Button onClick={save}>Save</Button>
      </div>
      <div>Total today: {total} kcal</div>
      <div className="h-64">
        <LineChart data={chart}>
          <XAxis dataKey="date" hide />
          <YAxis hide />
          <Tooltip />
          <Line type="monotone" dataKey="calories" stroke="#8884d8" />
        </LineChart>
      </div>
    </div>
  );
};

export default CoachTracker;

