import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Direction } from 'radix-ui'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import './i18n.js'
import './index.css'

// Feeds the active text direction to every Radix primitive (Select, Dialog, …);
// re-renders on language change because useTranslation subscribes to i18next.
//
// AuthProvider sits inside the Router (it re-checks the session on navigation)
// and outside App. The documents store is mounted by App only once a user is
// signed in, so it never fires an unauthenticated request.
function Root() {
  const { i18n } = useTranslation()
  return (
    <Direction.Provider dir={i18n.dir()}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </Direction.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
