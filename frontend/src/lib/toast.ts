import { toast as sonnerToast } from "sonner"

/**
 * Toast Service – نقطة واحدة لكل الإشعارات في التطبيق.
 * لا تستدعي sonner مباشرة من الـ components أو الـ hooks.
 */
export const toastService = {
  success: (message: string, description?: string) => {
    sonnerToast.success(message, {
      description,
      duration: 3000,
    })
  },

  error: (message: string, description?: string) => {
    sonnerToast.error(message, {
      description,
      duration: 4000,
    })
  },

  info: (message: string, description?: string) => {
    sonnerToast.info(message, {
      description,
      duration: 3000,
    })
  },

  loading: (message: string) => {
    return sonnerToast.loading(message)
  },

  dismiss: (id?: string | number) => {
    sonnerToast.dismiss(id)
  },

  /** رسائل جاهزة للعمليات الشائعة */
  operationSuccess: (operation: "create" | "update" | "delete" | "save") => {
    const messages = {
      create: "تمت الإضافة بنجاح",
      update: "تم التحديث بنجاح",
      delete: "تم الحذف بنجاح",
      save: "تم الحفظ بنجاح",
    }
    sonnerToast.success(messages[operation])
  },

  operationError: (operation: "create" | "update" | "delete" | "save" | "fetch") => {
    const messages = {
      create: "فشلت عملية الإضافة",
      update: "فشلت عملية التحديث",
      delete: "فشلت عملية الحذف",
      save: "فشل الحفظ",
      fetch: "فشل جلب البيانات",
    }
    sonnerToast.error(messages[operation])
  },
}
