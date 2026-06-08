const { sha256 } = require('../../utils/sha256');
const api = require('../../utils/api');

Page({
  data: {
    studentId: '',
    password: '',
    loading: false,
    modalVisible: false,
    modalMsg: '',
  },

  onLoad() {
    // 如果已有 token 且未过期，直接跳转首页
    const token = wx.getStorageSync('student_token');
    if (token) {
      try {
        const payload = this.decodePayload(token);
        if (payload.exp * 1000 > Date.now()) {
          wx.redirectTo({ url: '/pages/index/index' });
        } else {
          wx.removeStorageSync('student_token');
          wx.removeStorageSync('student_info');
        }
      } catch {
        wx.removeStorageSync('student_token');
        wx.removeStorageSync('student_info');
      }
    }
  },

  decodePayload(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    const json = atob(padded);
    const bytes = new Uint8Array(json.length);
    for (let i = 0; i < json.length; i++) bytes[i] = json.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  },

  onStudentIdInput(e) {
    this.setData({ studentId: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  async handleLogin() {
    const { studentId, password } = this.data;
    if (!studentId.trim()) {
      this.showModal('请输入学号');
      return;
    }
    if (!password) {
      this.showModal('请输入密码');
      return;
    }

    this.setData({ loading: true });
    try {
      const prehash = sha256(password);
      const res = await api.post('/student/login', {
        student_id: studentId.trim(),
        password: prehash,
      });

      wx.setStorageSync('student_token', res.data.token);
      wx.setStorageSync('student_info', JSON.stringify({
        student_id: res.data.student_id,
        name: res.data.name,
        class_name: res.data.class_name,
      }));

      if (res.data.need_change_password) {
        wx.showToast({ title: '首次登录，请先修改密码', icon: 'none' });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/change-password/change-password' });
        }, 1500);
      } else {
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/index/index' });
        }, 800);
      }
    } catch (err) {
      const msg = err.data?.error || err.message || '登录失败';
      this.showModal(msg);
    } finally {
      this.setData({ loading: false });
    }
  },

  showModal(msg) {
    this.setData({ modalMsg: msg, modalVisible: true });
  },

  onModalClose() {
    this.setData({ modalVisible: false });
  },
});
