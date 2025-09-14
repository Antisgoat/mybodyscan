import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";

const Explore = () => {
  return (
    <main className="min-h-screen bg-background p-6">
      <Seo 
        title="Explore MyBodyScan – Body Fat Tracking Made Simple" 
        description="Discover how MyBodyScan uses photos to track body fat percentage, weight, and progress with privacy-first technology." 
        canonical={window.location.href} 
      />
      
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Track Your Body Fat Progress</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            MyBodyScan uses advanced photo analysis to estimate body fat percentage and track your fitness journey—private, accurate, and simple.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">📸 Photo Analysis</CardTitle>
              <CardDescription>
                Upload 4 photos and get accurate body fat estimates using proven measurement techniques.
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">📊 Progress Tracking</CardTitle>
              <CardDescription>
                Compare scans over time to see your body composition changes and fitness improvements.
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">🔒 Privacy First</CardTitle>
              <CardDescription>
                Your photos and data stay private and secure. You control what gets shared and with whom.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="text-center space-y-4">
          <div className="space-x-4">
            <Button asChild size="lg">
              <Link to="/auth">Get Started</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/legal/privacy">Learn More</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Start with a free scan or explore our plans
          </p>
        </div>
      </div>
    </main>
  );
};

export default Explore;