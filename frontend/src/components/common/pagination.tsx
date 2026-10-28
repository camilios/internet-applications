import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface PaginationProps {
  page: number
  lastPage: number
  onPageChange: (page: number) => void
  className?: string
}

/**
 * Simple controlled pagination.
 * Works perfectly with TanStack Query + server-side pagination.
 */
export function Pagination({ page, lastPage, onPageChange, className }: PaginationProps) {
  if (lastPage <= 1) return null

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <Button
        variant="outline"
        size="icon"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <span className="text-sm text-muted-foreground">
        صفحة {page} من {lastPage}
      </span>

      <Button
        variant="outline"
        size="icon"
        disabled={page >= lastPage}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  )
}
