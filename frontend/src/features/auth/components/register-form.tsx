import { useForm } from "@tanstack/react-form";
import { registerSchema } from "../schemas/auth.schema";
import { useRegister } from "../hooks/use-register";
import { FormField } from "@/components/common/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getFieldError } from "@/lib/utils/form-errors";

export function RegisterForm() {
  const registerMutation = useRegister();

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
    onSubmit: ({ value }) => {
      registerMutation.mutate(value);
    },
    validators: {
      onChange: registerSchema,
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
        name="name"
        children={(field) => (
          <FormField
            name={field.name}
            label="الاسم الكامل"
            required
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="أحمد محمد"
              autoComplete="name"
            />
          </FormField>
        )}
      />

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
              autoComplete="new-password"
            />
          </FormField>
        )}
      />

      <form.Field
        name="passwordConfirmation"
        children={(field) => (
          <FormField
            name={field.name}
            label="تأكيد كلمة المرور"
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
              autoComplete="new-password"
            />
          </FormField>
        )}
      />

      <Button
        type="submit"
        className="w-full"
        disabled={registerMutation.isPending || !form.state.canSubmit}
      >
        {registerMutation.isPending && (
          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        )}
        إنشاء الحساب
      </Button>
    </form>
  );
}
