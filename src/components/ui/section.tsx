import * as React from "react"
import { cn } from "@app/lib/utils.ts"

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title?: string
  description?: string
  children: React.ReactNode
}

function Section({ title, description, className, children, ...props }: SectionProps) {
  return (
    <section className={cn("space-y-4", className)} {...props}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h2 className="text-lg font-semibold leading-none tracking-tight">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      <div>{children}</div>
    </section>
  )
}

export { Section }