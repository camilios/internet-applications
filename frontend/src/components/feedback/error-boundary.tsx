import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Class component is required for Error Boundaries in React.
 * Wrap heavy feature trees with this.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can log to an error reporting service here
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">حدث خطأ غير متوقع</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {import.meta.env.DEV && this.state.error?.message
              ? this.state.error.message
              : "نعتذر، حدثت مشكلة. حاول تحديث الصفحة."}
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: undefined })}>
            إعادة المحاولة
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
