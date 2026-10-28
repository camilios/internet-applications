import type { ReactNode } from "react"
import { cn } from "@/lib/utils/cn"
import { Inbox } from "lucide-react"

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title = "لا توجد بيانات",
  description = "لم يتم العثور على أي عناصر حتى الآن.",
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center",
        className
      )}
    >
      <div className="rounded-full bg-muted p-4">
        {icon ?? <Inbox className="h-8 w-8 text-muted-foreground" />}
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
