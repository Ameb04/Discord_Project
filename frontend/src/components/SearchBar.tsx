import type { FormEvent } from 'react'

type SearchBarProps = {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  onSubmit: (value: string) => void
}

function SearchBar({ value, disabled = false, onChange, onSubmit }: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit(value)
  }

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <label className="search-label" htmlFor="user-search">
        Search users
      </label>
      <div className="search-controls">
        <input
          id="user-search"
          type="search"
          value={value}
          placeholder="Username"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="submit" disabled={disabled}>
          Search
        </button>
      </div>
    </form>
  )
}

export default SearchBar
