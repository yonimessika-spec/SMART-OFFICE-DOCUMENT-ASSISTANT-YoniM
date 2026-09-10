import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as authApi from '../api/auth.js'
import { setSessionExpiredHandler } from '../api/session.js'

// Holds the current user ({ id, username, role }) or null. Must live inside the
// Router — it re-checks the session on every navigation so a role change made by
// an Admin is reflected in this user's UI on their very next click, with no
// forced logout (the server already enforces the fresh role on each request; this
// just keeps the buttons in sync).

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Initial "am I logged in?" probe + wire the 401 bridge from the fetch layer.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
    let alive = true
    authApi
      .fetchMe()
      .then((d) => alive && setUser(d.user))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // Re-sync role/identity on navigation (cheap GET) once we have a user.
  useEffect(() => {
    if (loading || !user) return
    let alive = true
    authApi
      .fetchMe()
      .then((d) => alive && setUser(d.user))
      .catch(() => {
        /* a dead session is already handled by the 401 bridge */
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const login = useCallback(async (username, password) => {
    const d = await authApi.login(username, password)
    setUser(d.user)
    return d.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* clearing local state is what matters */
    }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
