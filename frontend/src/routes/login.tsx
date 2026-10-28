import { createFileRoute, redirect, Link } from "@tanstack/react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { LoginForm } from "@/features/auth/components/login-form"
import { z } from "zod"

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState()
    if (isAuthenticated) {
      throw redirect({ to: "/" })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">تسجيل الدخول</h1>
          <p className="text-sm text-muted-foreground">
            أدخل بياناتك للوصول إلى لوحة التحكم
          </p>
        </div>

        <LoginForm redirectTo={redirectTo} />

        <p className="text-center text-sm text-muted-foreground">
          ليس لديك حساب؟{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            إنشاء حساب
          </Link>
        </p>
      </div>
    </div>
  )
}
