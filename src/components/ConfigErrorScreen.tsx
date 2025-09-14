import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function ConfigErrorScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Setup Incomplete
          </CardTitle>
          <CardDescription>
            Firebase configuration is missing or invalid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Please configure your Firebase environment variables to continue.
              Check the console for missing configuration details.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}