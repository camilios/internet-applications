import { z } from "zod";

export const productSchema = z.object({
  name: z
    .string()
    .min(2, "اسم المنتج يجب أن يكون حرفين على الأقل")
    .max(255, "الاسم طويل جداً"),
  description: z.string().max(2000, "الوصف طويل جداً"),
  price: z.number().min(0.01, "السعر يجب أن يكون أكبر من صفر"),
  category_id: z.number().int().positive("التصنيف مطلوب"),
  is_active: z.boolean(),
  // الصورة تتعامل بشكل منفصل لأنها File
});

export type ProductFormValues = z.infer<typeof productSchema>;
