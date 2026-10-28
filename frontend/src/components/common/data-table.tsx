import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils/cn"
import { LoadingSpinner } from "@/components/feedback/loading-spinner"
import { EmptyState } from "@/components/feedback/empty-state"
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

/**
 * Fully reusable TanStack Table wrapper.
 * Use it for Products, Orders, Users... just pass columns + data.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyTitle,
  emptyDescription,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return <LoadingSpinner text="جاري التحميل..." />
  }

  if (!data.length) {
    return (
      <EmptyState
        title={emptyTitle ?? "لا توجد بيانات"}
        description={emptyDescription ?? "لم يتم العثور على أي عناصر."}
      />
    )
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-right">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="text-right">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Helper to create a sortable column header quickly.
 */
export function SortableHeader<TData>({
  column,
  title,
}: {
  column: Column<TData, unknown>
  title: string
}) {
  const sorted = column.getIsSorted()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-mr-3 h-8 data-[state=open]:bg-accent"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {title}
      {sorted === "asc" ? (
        <ArrowUp className="mr-2 h-3.5 w-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="mr-2 h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="mr-2 h-3.5 w-3.5 opacity-50" />
      )}
    </Button>
  )
}
