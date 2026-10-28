import { createFileRoute, redirect } from "@tanstack/react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ROLES } from "@/lib/constants/roles"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/feedback/empty-state"
import { DataTable } from "@/components/common/data-table"
import { Pagination } from "@/components/common/pagination"
import { useUsers } from "@/features/users/hooks/use-users"
import type { User } from "@/types/auth"
import { ROLE_LABELS } from "@/lib/constants/roles"
import { formatDate } from "@/lib/utils/format"
import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

export const Route = createFileRoute("/_authenticated/users/")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState()
    if (user?.role !== ROLES.ADMIN) {
      throw redirect({ to: "/" })
    }
  },
  component: UsersPage,
})

function UsersPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = useUsers(page)
  const columns: ColumnDef<User>[] = [
    { accessorKey: "name", header: "الاسم" },
    { accessorKey: "email", header: "البريد الإلكتروني" },
    { accessorKey: "role", header: "الصلاحية", cell: ({ row }) => ROLE_LABELS[row.original.role] },
    { accessorKey: "created_at", header: "تاريخ التسجيل", cell: ({ row }) => formatDate(row.original.created_at) },
  ]

  return (
    <div>
      <PageHeader
        title="المستخدمون"
        description="إدارة حسابات المستخدمين (للمسؤولين فقط)"
      />
      {error ? (
        <EmptyState title="تعذر تحميل المستخدمين" description={error.message} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            emptyTitle="لا يوجد مستخدمون"
            emptyDescription="لم يتم تسجيل أي مستخدمين بعد."
          />
          {data?.meta && (
            <Pagination
              className="mt-4"
              page={data.meta.current_page}
              lastPage={data.meta.last_page}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  )
}
