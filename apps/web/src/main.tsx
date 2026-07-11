import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import { AuthProvider, useAuth } from './modules/shared/auth'
import { useEffect } from 'react'

const router = getRouter()

function App() {
  const auth = useAuth()

  useEffect(() => {
    router.invalidate()
  }, [auth.loading, auth.user])

  return <RouterProvider router={router} context={{ auth }} />
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}
