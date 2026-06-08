const api = require('../../utils/api');
const bitmapUtil = require('../../utils/bitmap');

Page({
  data: {
    studentInfo: {},
    textbooks: [],
    bitmap: '0',
    isConfirmed: false,
    confirmedCount: 0,
    loading: true,
    saving: false,
    cancelling: false,
    confirmModalVisible: false,
    cancelModalVisible: false,
    confirmCooldown: 0,
    cooldownModalVisible: false,
    cooldownMsg: '',
  },

  _confirmTimer: null,

  _startConfirmCooldown() {
    if (this._confirmTimer) clearInterval(this._confirmTimer);
    let remaining = 10;
    this.setData({ confirmCooldown: remaining });
    this._confirmTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(this._confirmTimer);
        this._confirmTimer = null;
        this.setData({ confirmCooldown: 0 });
      } else {
        this.setData({ confirmCooldown: remaining });
      }
    }, 1000);
  },

  _stopConfirmCooldown() {
    if (this._confirmTimer) {
      clearInterval(this._confirmTimer);
      this._confirmTimer = null;
    }
    this.setData({ confirmCooldown: 0 });
  },

  onLoad() {
    const infoStr = wx.getStorageSync('student_info');
    if (!infoStr) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ studentInfo: JSON.parse(infoStr) });
    this.fetchData();
  },

  async fetchData() {
    this.setData({ loading: true });
    try {
      const res = await api.get('/student/textbooks');
      const data = res.data;
      if (!Array.isArray(data.textbooks_json)) {
        wx.showToast({ title: '数据格式错误', icon: 'none' });
        return;
      }
      const list = data.textbooks_json.map((tb, index) => ({
        ...tb,
        index,
        checked: bitmapUtil.isConfirmed(data.selection_bitmap, index),
      }));
      this.setData({
        textbooks: list,
        bitmap: bitmapUtil.toString(data.selection_bitmap),
        isConfirmed: data.is_confirmed,
      });
      this._updateCounts(list);
    } catch (err) {
      wx.showToast({ title: err.data?.error || '获取教材列表失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onToggle(e) {
    if (this.data.isConfirmed) return;
    const index = e.currentTarget.dataset.index;
    const textbooks = this.data.textbooks.map((tb, i) => {
      if (i === index) {
        return { ...tb, checked: !tb.checked };
      }
      return tb;
    });
    const newBitmap = bitmapUtil.toggle(this.data.bitmap, index, textbooks[index].checked);
    this.setData({ textbooks, bitmap: bitmapUtil.toString(newBitmap) });
    this._updateCounts(textbooks);
  },

  _updateCounts(list) {
    const confirmedCount = list.filter(tb => tb.checked).length;
    this.setData({ confirmedCount, cancelledCount: list.length - confirmedCount });
  },

  handleSave() {
    this.setData({ confirmModalVisible: true });
    this._startConfirmCooldown();
  },

  onConfirmClose() {
    this._stopConfirmCooldown();
    this.setData({ confirmModalVisible: false });
  },

  async handleConfirmSave() {
    this.setData({ confirmModalVisible: false, saving: true });
    try {
      await api.post('/student/bitmap', { new_bitmap: this.data.bitmap });
      wx.showToast({ title: '提交成功', icon: 'success' });
      await this.fetchData();
    } catch (err) {
      if (err.statusCode === 429) {
        const sec = err.data?.cooldown_seconds || 10;
        this.setData({
          cooldownMsg: `操作太频繁，请 ${sec} 秒后再试`,
          cooldownModalVisible: true,
        });
      } else if (err.statusCode === 403) {
        wx.showToast({ title: '已确认，不可重复提交', icon: 'none' });
        await this.fetchData();
      } else {
        wx.showToast({ title: err.data?.error || '提交失败', icon: 'none' });
      }
    } finally {
      this.setData({ saving: false });
    }
  },

  openCancelModal() {
    this.setData({ cancelModalVisible: true });
    this._startConfirmCooldown();
  },

  onCancelModalClose() {
    this._stopConfirmCooldown();
    this.setData({ cancelModalVisible: false });
  },

  async handleCancelModalConfirm() {
    this.setData({ cancelModalVisible: false, cancelling: true });
    try {
      await api.post('/student/cancel-confirm', {});
      wx.showToast({ title: '已取消确认，10秒后可重新选择', icon: 'none' });
      await this.fetchData();
    } catch (err) {
      if (err.statusCode === 429) {
        const sec = err.data?.cooldown_seconds || 10;
        this.setData({
          cooldownMsg: `冷却期中，请 ${sec} 秒后再试`,
          cooldownModalVisible: true,
        });
      } else {
        wx.showToast({ title: err.data?.error || '取消失败', icon: 'none' });
      }
    } finally {
      this.setData({ cancelling: false });
    }
  },

  onCooldownClose() {
    this.setData({ cooldownModalVisible: false });
  },

  async handleLogout() {
    try {
      await api.post('/student/logout', {});
    } catch {
      // ignore
    }
    wx.removeStorageSync('student_token');
    wx.removeStorageSync('student_info');
    wx.redirectTo({ url: '/pages/login/login' });
  },
});
