import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'

function SettingsPage() {
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState('')

  async function handleLogout() {
    setIsLoggingOut(true)
    setError('')

    try {
      await logout()
      navigate('/', { replace: true })
    } catch {
      setError('Logout is unavailable right now. Please try again.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <main className="page-shell settings-page">
      <section className="page-header">
        <h1 className="page-title">Settings</h1>
      </section>

      <button
        className="logout-button"
        type="button"
        disabled={isLoggingOut}
        onClick={handleLogout}
      >
        {isLoggingOut ? 'Logging out...' : 'Logout'}
      </button>

      {error && <p className="status-message error-message">{error}</p>}
    </main>
  )
}

export default SettingsPage
