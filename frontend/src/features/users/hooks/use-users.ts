import { keepPreviousData } from "@tanstack/react-query"
import { useGetAll } from "@/hooks/api"
import { usersApi } from "../api/users.api"

export const userKeys = {
  all: ["users"] as const,
  list: (page: number) => [...userKeys.all, page] as const,
}

export function useUsers(page: number) {
  return useGetAll(userKeys.list(page), () => usersApi.getAll(page), {
    placeholderData: keepPreviousData,
  })
}
