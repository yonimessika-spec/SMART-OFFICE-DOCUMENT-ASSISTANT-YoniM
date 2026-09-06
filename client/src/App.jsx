import { NavLink, Route, Routes } from 'react-router-dom'
import { USE_MOCK_DOCUMENTS, USE_MOCK_PROCESS, USE_MOCK_REVIEW } from './api/index.js'
import Dashboard from './screens/Dashboard.jsx'
import Upload from './screens/Upload.jsx'
import DocumentDetail from './screens/DocumentDetail.jsx'

// Honestly show which calls are still served by the mock (SPEC.md §1).
const MOCKED = [
  USE_MOCK_DOCUMENTS && 'documents',
  USE_MOCK_PROCESS && 'process',
  USE_MOCK_REVIEW && 'review',
].filter(Boolean)

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <span className="app__title">Smart Office Document Assistant</span>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/upload">Upload</NavLink>
        </nav>
        {MOCKED.length > 0 && (
          <span className="app__badge">MOCK: {MOCKED.join(', ')}</span>
        )}
      </header>

      <main className="app__main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/document/:id" element={<DocumentDetail />} />
          <Route path="*" element={<p className="state">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}
