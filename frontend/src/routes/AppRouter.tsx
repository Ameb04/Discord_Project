import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import SearchResultsPage from '../pages/SearchResultsPage'
import SettingsPage from '../pages/SettingsPage'

function HomePage() {
  return (
    <main className="page-shell home-page">
      <section className="page-header">
        <p className="eyebrow">Discord Project</p>
        <h1 className="page-title">Frontend</h1>
        <p className="page-copy">Open user search to test the current sprint page.</p>
      </section>
      <Link className="primary-link" to="/search">
        Go to user search
      </Link>
    </main>
  )
}

function AppRouter() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <Link className="brand-link" to="/">
            Discord Project
          </Link>
          <nav aria-label="Main navigation">
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default AppRouter
