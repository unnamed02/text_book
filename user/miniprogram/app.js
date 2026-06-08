App({
  globalData: {
    apiBaseUrl: 'http://localhost:8080/api',
  },
  onLaunch() {
    // 检查本地 token 是否有效
    const token = wx.getStorageSync('student_token');
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },
});
