import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PageSkeleton() {
  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Skeleton className="h-8 w-48 mb-4" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}

export function CaptureSkeleton() {
  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Skeleton className="h-8 w-40 mb-4" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg">
            <Skeleton className="h-full w-full" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}