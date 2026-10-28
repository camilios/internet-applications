import { createFileRoute, redirect, Link } from "@tanstack/react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { RegisterForm } from "@/features/auth/components/register-form"

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState()
    if (isAuthenticated) {
      throw redirect({ to: "/" })
    }
  },
  component: RegisterPage,
})

function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">إنشاء حساب جديد</h1>
          <p className="text-sm text-muted-foreground">
            أدخل بياناتك للتسجيل في المنصة
          </p>
        </div>

        <RegisterForm />

        <p className="text-center text-sm text-muted-foreground">
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  )
}
