import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const SettingsUnits = () => {
  const [units, setUnits] = useState<"us" | "metric">("us");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);
      const u = snap.data()?.settings?.units;
      if (u === "metric" || u === "us") setUnits(u);
    })();
  }, []);

  const save = async (u: "us" | "metric") => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setUnits(u);
    await setDoc(doc(db, "users", uid), { settings: { units: u } }, { merge: true });
  };

  return (
    <main className="p-6 max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant={units === "us" ? "default" : "secondary"} onClick={() => save("us")}>US</Button>
          <Button variant={units === "metric" ? "default" : "secondary"} onClick={() => save("metric")}>Metric</Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default SettingsUnits;
