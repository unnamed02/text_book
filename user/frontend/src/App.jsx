import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import TextbookList from './pages/TextbookList'

function decodePayload(token) {
  const base64Url = token.split('.')[1]
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const json = atob(padded)
  // 处理 UTF-8 中文：将 Latin-1 字节序列转回 Uint8Array 再解码
  const bytes = new Uint8Array(json.length)
  for (let i = 0; i < json.length; i++) bytes[i] = json.charCodeAt(i)
  return JSON.parse(new TextDecoder().decode(bytes))
}

function isTokenValid(token) {
  if (!token) return false
  try {
    const payload = decodePayload(token)
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

function RequireAuth({ children }) {
  const token = localStorage.getItem('student_token')
  if (!isTokenValid(token)) {
    localStorage.removeItem('student_token')
    localStorage.removeItem('student_info')
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePassword />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <TextbookList />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
