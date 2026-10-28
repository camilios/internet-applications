import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTheme } from "@/app/providers/theme-provider"
import { Button } from "@/components/ui/button"
import { Moon, Sun, Monitor } from "lucide-react"
import { cn } from "@/lib/utils/cn"

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsPage,
})

function SettingsPage() {
  const { theme, setTheme } = useTheme()

  const themes = [
    { value: "light" as const, label: "فاتح", icon: Sun },
    { value: "dark" as const, label: "داكن", icon: Moon },
    { value: "system" as const, label: "حسب النظام", icon: Monitor },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="الإعدادات" description="تخصيص تجربة الاستخدام" />

      <Card>
        <CardHeader>
          <CardTitle>المظهر</CardTitle>
          <CardDescription>اختر الوضع الفاتح أو الداكن</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((t) => (
              <Button
                key={t.value}
                variant="outline"
                className={cn(
                  "flex h-20 flex-col gap-2",
                  theme === t.value && "border-primary bg-primary/5"
                )}
                onClick={() => setTheme(t.value)}
              >
                <t.icon className="h-5 w-5" />
                <span className="text-xs">{t.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
