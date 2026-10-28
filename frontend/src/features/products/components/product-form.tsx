import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { productSchema } from "../schemas/product.schema";
import { useCreateProduct, useUpdateProduct } from "../hooks/use-products";
import { useCategories } from "@/features/categories/hooks/use-categories";
import type { Product, ProductInput } from "../types";
import { FormField } from "@/components/common/form-field";
import { ImageUpload } from "@/components/common/image-upload";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getFieldError } from "@/lib/utils/form-errors";

interface ProductFormProps {
  /** لو موجود، الفورم بيشتغل في وضع التعديل */
  product?: Product;
}

/**
 * ProductForm للإنشاء والتعديل.
 * - TanStack Form + Zod
 * - التصنيف من القائمة (category_id)
 * - الحالة (is_active) تظهر في وضع التعديل فقط
 */
export function ProductForm({ product }: ProductFormProps) {
  const navigate = useNavigate();
  const isEdit = !!product;

  const { data: categories = [], isLoading: categoriesLoading } =
    useCategories();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct(product?.id ?? 0);
  const isPending = createMutation.isPending || updateMutation.isPending;

  // File جديد، أو رابط الصورة الحالية، أو null
  const [image, setImage] = useState<File | string | null>(
    product?.image_url ?? null,
  );

  const form = useForm({
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      price: product ? Number(product.price) : 0,
      category_id: product?.category.id ?? 0,
      is_active: product?.is_active ?? true,
    },
    onSubmit: ({ value }) => {
      const payload: ProductInput = {
        ...value,
        image: image instanceof File ? image : undefined,
      };
      const options = { onSuccess: () => navigate({ to: "/products" }) };

      if (isEdit) {
        updateMutation.mutate(payload, options);
      } else {
        createMutation.mutate(payload, options);
      }
    },
    validators: {
      onChange: productSchema,
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="mx-auto max-w-2xl space-y-6"
    >
      <FormField name="image" label="صورة المنتج">
        <ImageUpload
          value={image}
          onChange={setImage}
          maxSizeMB={2}
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
          placeholder="اسحب صورة المنتج هنا أو اضغط للاختيار"
        />
      </FormField>

      <form.Field
        name="name"
        children={(field) => (
          <FormField
            name={field.name}
            label="اسم المنتج"
            required
            error={getFieldError(field.state.meta.errors)}
          >
            <Input
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="مثال: iPhone 15 Pro"
            />
          </FormField>
        )}
      />

      <form.Field
        name="description"
        children={(field) => (
          <FormField
            name={field.name}
            label="الوصف"
            error={getFieldError(field.state.meta.errors)}
          >
            <Textarea
              id={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="وصف مختصر للمنتج..."
              rows={4}
            />
          </FormField>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field
          name="price"
          children={(field) => (
            <FormField
              name={field.name}
              label="السعر (ر.س)"
              required
              error={getFieldError(field.state.meta.errors)}
            >
              <Input
                id={field.name}
                type="number"
                step="0.01"
                min="0"
                value={field.state.value || ""}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                dir="ltr"
              />
            </FormField>
          )}
        />

        <form.Field
          name="category_id"
          children={(field) => (
            <FormField
              name={field.name}
              label="التصنيف"
              required
              error={getFieldError(field.state.meta.errors)}
            >
              <select
                id={field.name}
                value={field.state.value || ""}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                disabled={categoriesLoading}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {categoriesLoading ? "جاري التحميل..." : "اختر التصنيف"}
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        />
      </div>

      {isEdit && (
        <form.Field
          name="is_active"
          children={(field) => (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
                className="h-4 w-4"
              />
              المنتج نشط (يظهر في المتجر)
            </label>
          )}
        />
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate({ to: "/products" })}
        >
          إلغاء
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          {isEdit ? "حفظ التعديلات" : "حفظ المنتج"}
        </Button>
      </div>
    </form>
  );
}
