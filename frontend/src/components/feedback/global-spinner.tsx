import { useLoadingStore } from "@/stores/loading.store"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils/cn"

/**
 * Global Spinner Overlay
 * يظهر فوق كل المحتوى لما أي عملية (get / create / update / delete) شغالة.
 * يتحط مرة واحدة في الـ AppShell أو الـ Providers.
 */
export function GlobalSpinner() {
  const isLoading = useLoadingStore((s) => s.isLoading)

  if (!isLoading) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-background/60 backdrop-blur-sm",
        "animate-in fade-in duration-200"
      )}
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6 shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          جاري المعالجة...
        </p>
      </div>
    </div>
  )
}
