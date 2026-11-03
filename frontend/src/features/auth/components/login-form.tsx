import { useForm } from "@tanstack/react-form";
import { useState, useEffect } from "react";
import { loginSchema } from "../schemas/auth.schema";
import { useLogin } from "../hooks/use-login";
import { FormField } from "@/components/common/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getFieldError } from "@/lib/utils/form-errors";
import { formatTimeMS } from "@/lib/utils/format";

/**
 * Example of a clean TanStack Form + Zod integration.
 */
interface LoginFormProps {
  /** المسار اللي نرجع له بعد الدخول (من ?redirect=) */
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const loginMutation = useLogin(redirectTo);
  const error = loginMutation.error;
  const [secondsLeft, setSecondsLeft] = useState(0);

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

  useEffect(() => {
    if (error?.statusCode === 429) setSecondsLeft(error.retryAfter ?? 60);
  }, [error]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const isRateLimited = secondsLeft > 0;

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

      {isRateLimited && (
        <p role="alert" className="text-sm text-destructive font-medium">
          محاولات كثيرة جداً. حاول مرة أخرى بعد ({formatTimeMS(secondsLeft)}) [دقيقة:ثانية].
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={
          loginMutation.isPending || !form.state.canSubmit || isRateLimited
        }
      >
        {loginMutation.isPending && (
          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        )}
        تسجيل الدخول
      </Button>
    </form>
  );
}
