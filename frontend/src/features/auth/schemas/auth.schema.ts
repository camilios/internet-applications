import { z } from "zod"

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("البريد الإلكتروني غير صالح"),
  // الباك يتحقق من القواعد الكاملة، هنا نتحقق من وجود القيمة فقط
  password: z.string().min(1, "كلمة المرور مطلوبة"),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, "الاسم مطلوب")
      .max(255, "الاسم طويل جداً"),
    email: z.string().email("البريد الإلكتروني غير صالح"),
    password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["passwordConfirmation"],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>
