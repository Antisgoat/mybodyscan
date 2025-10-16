import { useEffect } from 'react';

/**
 * Test route for error boundary testing
 * This component intentionally throws an error to test error boundary functionality
 */
export default function CrashTest() {
  useEffect(() => {
    // Intentionally throw an error to test error boundary
    throw new Error('Test error for error boundary testing');
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">This should not be visible</h1>
        <p className="text-muted-foreground">
          If you can see this, the error boundary is not working correctly.
        </p>
      </div>
    </div>
  );
}