import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SectionCardProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  title,
  description,
  children,
}: SectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
