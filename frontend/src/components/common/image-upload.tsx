import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react"
import { Upload, X } from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { Button } from "@/components/ui/button"

interface ImageUploadProps {
  /** القيمة الحالية (File أو URL موجود مسبقاً) */
  value?: File | string | null
  /** يتم استدعاؤها عند اختيار أو حذف صورة */
  onChange: (file: File | null) => void
  /** أقصى حجم بالميجابايت (افتراضي 5MB) */
  maxSizeMB?: number
  /** الأنواع المسموحة */
  accept?: string
  /** تعطيل الرفع */
  disabled?: boolean
  className?: string
  /** نص توضيحي */
  placeholder?: string
}

/**
 * مكون رفع صور قابل لإعادة الاستخدام.
 * - Drag & Drop
 * - معاينة فورية (تنحذف object URL تلقائياً)
 * - التحقق من الحجم والنوع
 * - حذف الصورة
 */
export function ImageUpload({
  value,
  onChange,
  maxSizeMB = 5,
  accept = "image/jpeg,image/png,image/webp,image/gif",
  disabled = false,
  className,
  placeholder = "اسحب الصورة هنا أو اضغط للاختيار",
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // نربط الـ object URL بعمر الملف: ينحذف لما الملف يتغير أو الكومبوننت يتفكك
  useEffect(() => {
    if (!localFile) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(localFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [localFile])

  const validateFile = (file: File): string | null => {
    const allowedTypes = accept.split(",").map((t) => t.trim())
    if (!allowedTypes.includes(file.type)) {
      return "نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP أو GIF أو BMP"
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `حجم الصورة يجب أن يكون أقل من ${maxSizeMB} ميجابايت`
    }
    return null
  }

  const handleFile = (file: File) => {
    setError(null)
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setLocalFile(file)
    onChange(file)
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // إعادة تعيين الـ input عشان نقدر نختار نفس الملف مرة ثانية
    e.target.value = ""
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleRemove = () => {
    setLocalFile(null)
    setError(null)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  // عرض الصورة: إما معاينة محلية أو URL قادم من الـ backend
  const displayUrl = preview ?? (typeof value === "string" ? value : null)

  const openPicker = () => {
    if (!disabled && !displayUrl) inputRef.current?.click()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openPicker()
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={placeholder}
        aria-disabled={disabled}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors",
          isDragging && "border-primary bg-primary/5",
          error && "border-destructive",
          disabled && "cursor-not-allowed opacity-60",
          !displayUrl && "hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        {displayUrl ? (
          <>
            <img
              src={displayUrl}
              alt="معاينة الصورة"
              className="h-full w-full object-cover"
            />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute left-2 top-2 h-8 w-8 rounded-full shadow-md"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove()
                }}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">حذف الصورة</span>
              </Button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <div className="rounded-full bg-muted p-3">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{placeholder}</p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WebP — أقصى حجم {maxSizeMB}MB
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          disabled={disabled}
          className="hidden"
        />
      </div>

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  )
}
