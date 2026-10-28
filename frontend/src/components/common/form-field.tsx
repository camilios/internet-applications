import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils/cn"

interface FormFieldProps {
  name: string
  label: string
  error?: string
  required?: boolean
  description?: string
  children: ReactNode
  className?: string
}

/**
 * Consistent form field wrapper.
 * Use it with any input (TanStack Form field, native, etc.)
 */
export function FormField({
  name,
  label,
  error,
  required,
  description,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name} className={cn(error && "text-destructive")}>
        {label}
        {required && <span className="mr-1 text-destructive">*</span>}
      </Label>

      {children}

      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  )
}
