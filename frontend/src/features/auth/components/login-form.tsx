import { useForm } from "@tanstack/react-form";
import { loginSchema } from "../schemas/auth.schema";
import { useLogin } from "../hooks/use-login";
import { FormField } from "@/components/common/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getFieldError } from "@/lib/utils/form-errors";

/**
 * Example of a clean TanStack Form + Zod integration.
 */
interface LoginFormProps {
  /** المسار اللي نرجع له بعد الدخول (من ?redirect=) */
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const loginMutation = useLogin(redirectTo);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: ({ value }) => {
      // النجاح والخطأ يتعالجوا داخل الـ hook، فما نحتاج await ولا try/catch هنا
      loginMutation.mutate(value);
    },
    validators: {
      onChange: loginSchema,
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field
        name="email"
        children={(field) => (
          <FormField
            name={field.name}
            label="البريد الإلكتروني"
            required
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id={field.name}
              type="email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              autoComplete="email"
            />
          </FormField>
        )}
      />

      <form.Field
        name="password"
        children={(field) => (
          <FormField
            name={field.name}
            label="كلمة المرور"
            required
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id={field.name}
              type="password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
              autoComplete="current-password"
            />
          </FormField>
        )}
      />

      <Button
        type="submit"
        className="w-full"
        disabled={loginMutation.isPending || !form.state.canSubmit}
      >
        {loginMutation.isPending && (
          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        )}
        تسجيل الدخول
      </Button>
    </form>
  );
}
