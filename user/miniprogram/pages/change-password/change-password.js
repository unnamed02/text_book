const { sha256 } = require('../../utils/sha256');
const api = require('../../utils/api');

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    loading: false,
    modalVisible: false,
    modalMsg: '',
  },

  onLoad() {
    const token = wx.getStorageSync('student_token');
    if (!token) {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  onOldPasswordInput(e) {
    this.setData({ oldPassword: e.detail.value });
  },

  onNewPasswordInput(e) {
    this.setData({ newPassword: e.detail.value });
  },

  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  async handleSubmit() {
    const { oldPassword, newPassword, confirmPassword } = this.data;

    if (!oldPassword) {
      this.showModal('请输入旧密码');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      this.showModal('新密码至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.showModal('两次输入的新密码不一致');
      return;
    }

    this.setData({ loading: true });
    try {
      const oldPrehash = sha256(oldPassword);
      const newPrehash = sha256(newPassword);
      await api.post('/student/change-password', {
        old_password: oldPrehash,
        new_password: newPrehash,
      });
      wx.showToast({ title: '密码修改成功，请重新登录', icon: 'none' });
      wx.removeStorageSync('student_token');
      wx.removeStorageSync('student_info');
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/login/login' });
      }, 1500);
    } catch (err) {
      const msg = err.data?.error || '修改失败';
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
