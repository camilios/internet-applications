import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OrderStatusControl } from "@/features/orders/components/order-status-control"
import type { OrderStatus } from "@/lib/constants/order-status"

afterEach(cleanup)

describe("admin status selection", () => {
  it("resets between transitions and disappears only after the delivered response", () => {
    const change = vi.fn()
    const { rerender } = render(<OrderStatusControl status="pending" isPending={false} onStatusChange={change} />)
    for (const next of ["confirmed", "processing", "shipped", "delivered"] as OrderStatus[]) {
      const select = screen.getByLabelText<HTMLSelectElement>("تحديث الحالة")
      expect(select.value).toBe("")
      fireEvent.change(select, { target: { value: next } })
      expect(change).toHaveBeenLastCalledWith(next)
      // Selecting is not confirmation that the server has saved the status.
      expect(screen.getByLabelText("تحديث الحالة")).toBeTruthy()
      rerender(<OrderStatusControl status={next} isPending={false} onStatusChange={change} />)
    }
    expect(change).toHaveBeenCalledTimes(4)
    expect(screen.queryByLabelText("تحديث الحالة")).toBeNull()
    expect(screen.queryByText("تحديث الحالة")).toBeNull()
  })

  it("keeps delivered selectable again after a failed request and disables pending requests", () => {
    const change = vi.fn()
    const { rerender } = render(<OrderStatusControl status="shipped" isPending={false} onStatusChange={change} />)
    const select = screen.getByLabelText<HTMLSelectElement>("تحديث الحالة")
    fireEvent.change(select, { target: { value: "delivered" } })
    expect(select.value).toBe("")
    fireEvent.change(select, { target: { value: "delivered" } })
    expect(change).toHaveBeenCalledTimes(2)
    rerender(<OrderStatusControl status="shipped" isPending={true} onStatusChange={change} />)
    expect(screen.getByLabelText<HTMLSelectElement>("تحديث الحالة").disabled).toBe(true)
  })

  it("has no status selector for cancelled orders", () => {
    render(<OrderStatusControl status="cancelled" isPending={false} onStatusChange={vi.fn()} />)
    expect(screen.queryByRole("combobox")).toBeNull()
  })
})
