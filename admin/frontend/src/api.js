const api = {
  request: async (url, options = {}) => {
    const token = localStorage.getItem('token');
    const defaultOptions = {
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const merged = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...(options.headers || {}),
      },
    };

    const res = await fetch(url, merged);

    if (res.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    return res;
  },

  get: async (url, options = {}) => {
    const res = await api.request(url, { method: 'GET', ...options });
    return res;
  },

  post: async (url, body, options = {}) => {
    const res = await api.request(url, {
      method: 'POST',
      body: body instanceof FormData || typeof body === 'string' ? body : JSON.stringify(body),
      ...options,
    });
    return res;
  },

  put: async (url, body, options = {}) => {
    const res = await api.request(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });
    return res;
  },

  del: async (url, options = {}) => {
    const res = await api.request(url, { method: 'DELETE', ...options });
    return res;
  },
};

export default api;
