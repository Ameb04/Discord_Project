import { useState } from 'react'
import { searchUsers } from '../api/users'
import SearchBar from '../components/SearchBar'
import UserCard from '../components/UserCard'
import type { User } from '../types/user'

function SearchResultsPage() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  async function handleSearch(nextQuery: string) {
    const trimmedQuery = nextQuery.trim()

    if (!trimmedQuery) {
      setUsers([])
      setError('')
      setHasSearched(false)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')
    setHasSearched(true)

    try {
      const matchedUsers = await searchUsers(trimmedQuery)
      setUsers(matchedUsers)
    } catch {
      setUsers([])
      setError('User search is unavailable right now. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="page-shell search-page">
      <section className="page-header">
        <p className="eyebrow">People</p>
        <h1 className="page-title">User search</h1>
      </section>

      <SearchBar
        value={query}
        disabled={isLoading}
        onChange={setQuery}
        onSubmit={handleSearch}
      />

      <section className="results-section" aria-live="polite" aria-busy={isLoading}>
        {isLoading && <p className="status-message">Searching users...</p>}

        {!isLoading && error && <p className="status-message error-message">{error}</p>}

        {!isLoading && !error && !hasSearched && (
          <p className="status-message">Enter a username to search.</p>
        )}

        {!isLoading && !error && hasSearched && users.length === 0 && (
          <p className="status-message">No users matched your search.</p>
        )}

        {!isLoading && !error && users.length > 0 && (
          <ul className="user-list">
            {users.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default SearchResultsPage
