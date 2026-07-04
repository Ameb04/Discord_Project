import apiClient from './client'
import type { User } from '../types/user'

export async function searchUsers(query: string): Promise<User[]> {
  const response = await apiClient.get<User[]>('/users/search/', {
    params: { q: query },
  })

  if (!Array.isArray(response.data)) {
    throw new Error('Unexpected user search response.')
  }

  return response.data
}
