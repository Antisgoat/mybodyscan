import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Utensils, Search, Settings, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { isDemoGuest } from "@/lib/demoFlag";

interface FoodItem {
  id: string;
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  portion_size?: number;
  portion_name?: string;
}

interface LogEntry {
  id: string;
  name: string;
  quantity: number;
  unit: 'g' | 'portions';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const demoFoodItems: FoodItem[] = [
  {
    id: '1',
    name: 'Chicken Breast',
    calories_per_100g: 165,
    protein_per_100g: 31,
    carbs_per_100g: 0,
    fat_per_100g: 3.6,
    portion_size: 120,
    portion_name: 'medium piece'
  },
  {
    id: '2',
    name: 'Brown Rice',
    calories_per_100g: 112,
    protein_per_100g: 2.6,
    carbs_per_100g: 22,
    fat_per_100g: 0.9
  },
  {
    id: '3',
    name: 'Greek Yogurt',
    calories_per_100g: 97,
    protein_per_100g: 17,
    carbs_per_100g: 9,
    fat_per_100g: 0,
    portion_size: 150,
    portion_name: 'cup'
  }
];

export default function Nutrition() {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [quantity, setQuantity] = useState(100);
  const [unit, setUnit] = useState<'g' | 'portions'>('g');
  const [dailyLog, setDailyLog] = useState<LogEntry[]>([]);
  const [targets, setTargets] = useState<DailyTargets>({
    calories: 2200,
    protein: 140, // ~1g per lb for 140lb person
    carbs: 250,
    fat: 75
  });
  const [weeklyData, setWeeklyData] = useState([]);
  const [isLogging, setIsLogging] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadDailyLog();
    loadWeeklyChart();
  }, []);

  const loadDailyLog = async () => {
    if (isDemoGuest()) {
      // Demo data
      setDailyLog([
        { id: '1', name: 'Oatmeal', quantity: 50, unit: 'g', calories: 190, protein: 6, carbs: 32, fat: 4 },
        { id: '2', name: 'Chicken Salad', quantity: 200, unit: 'g', calories: 280, protein: 35, carbs: 8, fat: 12 }
      ]);
      return;
    }

    try {
      // Backend call: getDayLog({ date: today })
      const today = new Date().toISOString().slice(0, 10);
      // const log = await getDayLog(today);
      // setDailyLog(log.entries || []);
    } catch (err) {
      console.log('Error loading daily log');
    }
  };

  const loadWeeklyChart = async () => {
    // Demo weekly data
    const demo = [
      { day: 'Mon', calories: 2100, protein: 130 },
      { day: 'Tue', calories: 2300, protein: 145 },
      { day: 'Wed', calories: 1950, protein: 120 },
      { day: 'Thu', calories: 2400, protein: 150 },
      { day: 'Fri', calories: 2200, protein: 140 },
      { day: 'Sat', calories: 2500, protein: 155 },
      { day: 'Sun', calories: 2000, protein: 125 }
    ];
    setWeeklyData(demo as any);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const isBarcode = /^\d{8,14}$/.test(query);
      
      if (isDemoGuest()) {
        // Demo search results
        const filtered = demoFoodItems.filter(item => 
          item.name.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(filtered);
      } else {
        // Backend call: foodSearch({ q: query, barcode: isBarcode ? query : undefined })
        // const results = await foodSearch({ q: isBarcode ? undefined : query, barcode: isBarcode ? query : undefined });
        // setSearchResults(results.items || []);
      }
    } catch (err) {
      toast({
        title: "Search failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    setSearchQuery(barcode);
    handleSearch(barcode);
  };

  const handleLogFood = async () => {
    if (!selectedFood) return;

    if (isDemoGuest()) {
      toast({
        title: "Sign up to use this feature",
        description: "Create a free account to track your nutrition.",
      });
      return;
    }

    const multiplier = unit === 'portions' && selectedFood.portion_size 
      ? (quantity * selectedFood.portion_size) / 100
      : quantity / 100;

    const entry: LogEntry = {
      id: Date.now().toString(),
      name: selectedFood.name,
      quantity,
      unit,
      calories: Math.round(selectedFood.calories_per_100g * multiplier),
      protein: Math.round(selectedFood.protein_per_100g * multiplier),
      carbs: Math.round(selectedFood.carbs_per_100g * multiplier),
      fat: Math.round(selectedFood.fat_per_100g * multiplier)
    };

    try {
      // Backend call: addFoodLog({ date: today, item: selectedFood, qty: { amount: quantity, unit } })
      setDailyLog([...dailyLog, entry]);
      setSelectedFood(null);
      setIsLogging(false);
      toast({ title: "Food logged successfully" });
    } catch (err) {
      toast({
        title: "Failed to log food",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleDeleteEntry = async (id: string) => {
    setDailyLog(dailyLog.filter(entry => entry.id !== id));
    toast({ title: "Entry removed" });
  };

  const totalCalories = dailyLog.reduce((sum, entry) => sum + entry.calories, 0);
  const totalProtein = dailyLog.reduce((sum, entry) => sum + entry.protein, 0);
  const totalCarbs = dailyLog.reduce((sum, entry) => sum + entry.carbs, 0);
  const totalFat = dailyLog.reduce((sum, entry) => sum + entry.fat, 0);

  const proteinAdherence = targets.protein > 0 ? (totalProtein / targets.protein) * 100 : 0;
  const showProteinBanner = proteinAdherence < 70;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Nutrition - MyBodyScan" description="Track your daily nutrition and macros" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <NotMedicalAdviceBanner />
        
        {showProteinBanner && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
            <p className="text-sm text-warning-foreground">
              Your protein intake has been low this week. Try to hit your daily target for better results.
            </p>
          </div>
        )}

        <div className="text-center space-y-2">
          <Utensils className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t('meals.title')}</h1>
        </div>

        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="targets">Targets</TabsTrigger>
          </TabsList>
          
          <TabsContent value="today" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Daily Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-foreground">{totalCalories}</div>
                    <div className="text-xs text-muted-foreground">Calories</div>
                    <div className="text-xs text-muted-foreground">/{targets.calories}</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-accent">{totalProtein}g</div>
                    <div className="text-xs text-muted-foreground">Protein</div>
                    <div className="text-xs text-muted-foreground">/{targets.protein}g</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-warning">{totalCarbs}g</div>
                    <div className="text-xs text-muted-foreground">Carbs</div>
                    <div className="text-xs text-muted-foreground">/{targets.carbs}g</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-destructive">{totalFat}g</div>
                    <div className="text-xs text-muted-foreground">Fat</div>
                    <div className="text-xs text-muted-foreground">/{targets.fat}g</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all" 
                         style={{ width: `${Math.min((totalCalories / targets.calories) * 100, 100)}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">This Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Line type="monotone" dataKey="calories" stroke="hsl(var(--primary))" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Today's Meals</span>
                  <Dialog open={isLogging} onOpenChange={setIsLogging}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Log Food</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <Input 
                            placeholder={t('meals.search')}
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value);
                              handleSearch(e.target.value);
                            }}
                            className="flex-1"
                          />
                          <BarcodeScanner onBarcodeScanned={handleBarcodeScanned} />
                        </div>
                        
                        {isSearching && <div className="text-center py-4 text-muted-foreground">Searching...</div>}
                        
                        {searchResults.length > 0 && (
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {searchResults.map((item) => (
                              <Button
                                key={item.id}
                                variant="outline"
                                className="w-full justify-start h-auto p-3"
                                onClick={() => setSelectedFood(item)}
                              >
                                <div className="text-left">
                                  <div className="font-medium">{item.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.calories_per_100g} cal/100g • P: {item.protein_per_100g}g
                                  </div>
                                </div>
                              </Button>
                            ))}
                          </div>
                        )}
                        
                        {selectedFood && (
                          <div className="space-y-4 border-t pt-4">
                            <div>
                              <h4 className="font-medium">{selectedFood.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {selectedFood.calories_per_100g} cal • {selectedFood.protein_per_100g}g protein per 100g
                              </p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Quantity</Label>
                                <Input 
                                  type="number" 
                                  value={quantity} 
                                  onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} 
                                />
                              </div>
                              <div>
                                <Label>Unit</Label>
                                <select 
                                  value={unit} 
                                  onChange={(e) => setUnit(e.target.value as 'g' | 'portions')}
                                  className="w-full p-2 border rounded"
                                >
                                  <option value="g">Grams</option>
                                  {selectedFood.portion_size && (
                                    <option value="portions">{selectedFood.portion_name || 'Portions'}</option>
                                  )}
                                </select>
                              </div>
                            </div>
                            
                            <Button onClick={handleLogFood} className="w-full">
                              Log Food
                            </Button>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyLog.length > 0 ? (
                  <div className="space-y-3">
                    {dailyLog.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{entry.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {entry.quantity}{entry.unit === 'g' ? 'g' : ` ${entry.unit}`} • 
                            {entry.calories} cal • P: {entry.protein}g • C: {entry.carbs}g • F: {entry.fat}g
                          </p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Utensils className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">No meals logged yet today</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="search" className="space-y-4">
            <div className="flex gap-2">
              <Input 
                placeholder={t('meals.search')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                className="flex-1"
              />
              <BarcodeScanner onBarcodeScanned={handleBarcodeScanned} />
            </div>
            
            {isSearching && (
              <div className="text-center py-8 text-muted-foreground">Searching...</div>
            )}
            
            {searchResults.length > 0 && (
              <div className="space-y-3">
                {searchResults.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{item.name}</h4>
                          <div className="text-sm text-muted-foreground mt-1">
                            <div>Per 100g: {item.calories_per_100g} cal • P: {item.protein_per_100g}g • C: {item.carbs_per_100g}g • F: {item.fat_per_100g}g</div>
                            {item.portion_size && (
                              <div className="mt-1">Per {item.portion_name || 'portion'} ({item.portion_size}g): {Math.round(item.calories_per_100g * item.portion_size / 100)} cal</div>
                            )}
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setSelectedFood(item);
                            setIsLogging(true);
                          }}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="targets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Daily Targets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Calories</Label>
                    <Input 
                      type="number" 
                      value={targets.calories} 
                      onChange={(e) => setTargets({...targets, calories: parseInt(e.target.value) || 0})} 
                    />
                  </div>
                  <div>
                    <Label>Protein (g)</Label>
                    <Input 
                      type="number" 
                      value={targets.protein} 
                      onChange={(e) => setTargets({...targets, protein: parseInt(e.target.value) || 0})} 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Carbs (g)</Label>
                    <Input 
                      type="number" 
                      value={targets.carbs} 
                      onChange={(e) => setTargets({...targets, carbs: parseInt(e.target.value) || 0})} 
                    />
                  </div>
                  <div>
                    <Label>Fat (g)</Label>
                    <Input 
                      type="number" 
                      value={targets.fat} 
                      onChange={(e) => setTargets({...targets, fat: parseInt(e.target.value) || 0})} 
                    />
                  </div>
                </div>
                
                <div className="bg-muted rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2">Recommendations</h4>
                  <p className="text-xs text-muted-foreground">
                    Protein: ~1g per lb body weight ({Math.round(targets.protein * 2.2)}lb person)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fat: 20-35% of total calories ({Math.round(targets.calories * 0.25 / 9)}-{Math.round(targets.calories * 0.35 / 9)}g)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Carbs: Fill remaining calories
                  </p>
                </div>
                
                <Button className="w-full" onClick={() => toast({ title: "Targets updated" })}>
                  Save Targets
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <BottomNav />
    </div>
  );
}