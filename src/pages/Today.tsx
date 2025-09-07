import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
export default function Today() {
  const navigate = useNavigate();

  function handleScan() {
    navigate("/scan/new");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Today’s Plan</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Workout</h2>
        <p className="text-sm text-muted-foreground">No workout logged.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Meals</h2>
        <p className="text-sm text-muted-foreground">Calorie target TBD.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Tip of the day</h2>
        <p className="text-sm text-muted-foreground">Stay hydrated.</p>
      </section>
      <div className="flex gap-2">
        <Button onClick={handleScan}>Scan</Button>
        <Button variant="secondary">Log Meal</Button>
        <Button variant="secondary">Log Workout</Button>
      </div>
    </div>
  );
}
