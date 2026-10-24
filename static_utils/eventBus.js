export const ASSET_LIST_INVALIDATED = 'assetListInvalidated'
// utils/eventBus.js
// 全局监听
export const CHAT_SESSION_RESET = 'chatSessionReset'

class EventBus {
  constructor() {
    this.events = {};
  }

  // 订阅
  on(event, callback) {
    if (typeof event !== 'string' || typeof callback !== 'function') {
      return;
    }
    if (!this.events[event]) {
      this.events[event] = [];
    }
    // 防止重复订阅
    if (!this.events[event].includes(callback)) {
      this.events[event].push(callback);
    }
  }

  // 发布
  emit(event, data) {
    if (typeof event !== 'string') {
      return;
    }
    if (!this.events[event] || this.events[event].length === 0) {
      return;
    }
    this.events[event].forEach(callback => {
      callback(data);
    });
  }

  // 取消订阅
  off(event, callback) {
    if (typeof event !== 'string' || typeof callback !== 'function') {
      return;
    }
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(fn => fn !== callback);
  }
}

// 创建单例
const eventBus = new EventBus();

export default eventBus;
