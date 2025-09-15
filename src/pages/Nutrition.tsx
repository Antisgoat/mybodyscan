import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Seo } from "@/components/Seo";
import { useTranslation } from "@/hooks/useTranslation";
import { Scan, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Nutrition = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dayLog, setDayLog] = useState<any[]>([]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      // Check if it's a barcode (8-14 digits)
      const isBarcode = /^\d{8,14}$/.test(searchQuery.trim());
      
      // Mock API call - replace with actual foodSearch({ q?, barcode? })
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockResults = [
        { 
          id: 1, 
          name: isBarcode ? "Product from barcode" : searchQuery,
          per100g: { kcal: 250, protein: 20, carbs: 10, fat: 15 },
          portion: { size: "1 cup", kcal: 150, protein: 12, carbs: 6, fat: 9 }
        }
      ];
      
      setSearchResults(mockResults);
    } catch (error) {
      toast({ title: t("error"), description: "Search failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeSearch = () => {
    // Mock barcode scanner - would integrate with mobile camera
    toast({ title: "Barcode Scanner", description: "Opening camera scanner..." });
  };

  const addToLog = (item: any, quantity: number, unit: string) => {
    const entry = {
      id: Date.now(),
      item,
      quantity,
      unit,
      timestamp: new Date()
    };
    setDayLog(prev => [...prev, entry]);
    toast({ title: t("success"), description: "Added to food log" });
  };

  const dayTotals = dayLog.reduce((totals, entry) => {
    const multiplier = entry.unit === 'portion' ? entry.quantity : entry.quantity / 100;
    const nutrition = entry.unit === 'portion' ? entry.item.portion : entry.item.per100g;
    
    return {
      kcal: totals.kcal + (nutrition.kcal * multiplier),
      protein: totals.protein + (nutrition.protein * multiplier),
      carbs: totals.carbs + (nutrition.carbs * multiplier),
      fat: totals.fat + (nutrition.fat * multiplier)
    };
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title={`${t("nutrition.title")} – MyBodyScan`} description="Track your nutrition" />
      
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
        {t("notmedicaladvice")}
      </div>

      <h1 className="text-2xl font-semibold mb-4">{t("nutrition.title")}</h1>

      {/* Search */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("nutrition.search")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Food name or barcode (8-14 digits)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleBarcodeSearch} variant="outline" size="icon">
              <Scan className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={handleSearch} disabled={loading} className="w-full">
            {loading ? t("loading") : <><Search className="h-4 w-4 mr-2" />{t("nutrition.search")}</>}
          </Button>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {searchResults.map((item) => (
              <div key={item.id} className="border rounded p-3">
                <h3 className="font-medium">{item.name}</h3>
                <div className="text-sm text-muted-foreground mt-1">
                  <div><strong>Per 100g:</strong> {item.per100g.kcal} kcal, {item.per100g.protein}g protein</div>
                  {item.portion && (
                    <div><strong>Per {item.portion.size}:</strong> {item.portion.kcal} kcal, {item.portion.protein}g protein</div>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => addToLog(item, 100, 'grams')}>
                    Add 100g
                  </Button>
                  {item.portion && (
                    <Button size="sm" variant="outline" onClick={() => addToLog(item, 1, 'portion')}>
                      Add 1 {item.portion.size}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Daily Targets */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("nutrition.targets")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium">Calories: {Math.round(dayTotals.kcal)} / 2000</div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{width: `${Math.min(100, (dayTotals.kcal/2000)*100)}%`}}></div>
              </div>
            </div>
            <div>
              <div className="font-medium">Protein: {Math.round(dayTotals.protein)}g / 120g</div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{width: `${Math.min(100, (dayTotals.protein/120)*100)}%`}}></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Food Log */}
      <Card>
        <CardHeader>
          <CardTitle>{t("nutrition.log")}</CardTitle>
        </CardHeader>
        <CardContent>
          {dayLog.length === 0 ? (
            <p className="text-muted-foreground text-sm">No entries yet. Search for food to get started!</p>
          ) : (
            <div className="space-y-2">
              {dayLog.map((entry) => (
                <div key={entry.id} className="flex justify-between items-center py-2 border-b">
                  <div>
                    <div className="font-medium">{entry.item.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {entry.quantity}{entry.unit === 'grams' ? 'g' : ` ${entry.item.portion?.size}`}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {Math.round(entry.unit === 'portion' 
                      ? entry.item.portion.kcal * entry.quantity 
                      : entry.item.per100g.kcal * (entry.quantity/100)
                    )} kcal
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default Nutrition;