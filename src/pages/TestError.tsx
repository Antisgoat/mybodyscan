import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function TestError() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error("Test error for error boundary - this is intentional");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Error Boundary Test</CardTitle>
          <CardDescription>
            This page is for testing the error boundary component
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Click the button below to trigger an error and test the error boundary
            </AlertDescription>
          </Alert>
          
          <Button 
            onClick={() => setShouldThrow(true)}
            variant="destructive"
            className="w-full"
          >
            Trigger Error
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}