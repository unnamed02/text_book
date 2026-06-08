import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('student_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const url = err.config?.url || ''
    console.log('[API拦截器]', 'status=', status, 'url=', url)
    // 登录接口的 401 由调用方自行处理（显示错误弹窗）
    const isLoginRequest = url.includes('/login')
    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem('student_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
