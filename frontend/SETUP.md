# إعداد المشروع خطوة بخطوة

## الخطوة 3: إعداد TanStack Router Plugin

الـ plugin يقوم بتوليد ملف `routeTree.gen.ts` تلقائياً من ملفات الـ routes.

### 1. تثبيت الـ packages

```bash
npm i @tanstack/react-router
npm i -D @tanstack/router-plugin
```

### 2. تعديل `vite.config.ts`

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import path from "path"

export default defineConfig({
  plugins: [
    // مهم: يجب أن يكون قبل react()
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePrefix: "-",
      quoteStyle: "single",
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### 3. تشغيل المشروع

```bash
npm run dev
```

عند تشغيل `dev` أو `build` سيقوم الـ plugin بتوليد/تحديث:
`src/routeTree.gen.ts`

هذا الملف **لا تعدله يدوياً** أبداً.

---

## الخطوة 4: إعداد Path Alias `@/`

عشان تقدر تكتب:
```ts
import { Button } from "@/components/ui/button"
```
بدل:
```ts
import { Button } from "../../../components/ui/button"
```

### 1. تعديل `tsconfig.app.json`

أضف داخل `compilerOptions`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

### 2. تعديل `tsconfig.json` (الجذر)

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 3. التأكد من `vite.config.ts`

يجب أن يحتوي على:

```ts
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
},
```

> ملاحظة: TypeScript يحتاج `paths`، وVite يحتاج `alias`. الاثنين مطلوبين.

---

## Image Upload

المكون موجود في:
`src/components/common/image-upload.tsx`

ويُستخدم داخل `ProductForm` بهذا الشكل:

```tsx
const [imageFile, setImageFile] = useState<File | null>(null)

<ImageUpload
  value={imageFile}
  onChange={setImageFile}
  maxSizeMB={5}
  placeholder="اسحب صورة المنتج هنا أو اضغط للاختيار"
/>
```

ثم تُرسل مع الـ FormData في الـ API (موجود مسبقاً في `products.api.ts`).
