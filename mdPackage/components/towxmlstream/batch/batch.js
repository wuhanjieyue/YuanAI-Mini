const config = require("../config");
const { getRenderContext } = require("../render-context");
const { openCitationSource } = require("../citation");
Component({
  options: {
    styleIsolation: "shared",
    virtualHost: true,
  },
  properties: {
    theme: { type: String, value: 'light' },
    batchId: {
      type: Number,
      value: 0,
    },
    contextId: {
      type: String,
      value: "",
    }
  },
  observers: {
    contextId() {
      this.bindRenderContext();
    },
  },
  lifetimes: {
    attached: function () {
      const _this = this;
      config.events.forEach(item => {
        _this["_" + item] = function (...args) {
          _this.invokeEvent(item, args);
        };
      });
    },
    ready: function () {
      this.bindRenderContext();
    },
    detached: function () {
      const renderContext = this._renderContext;
      if (renderContext && renderContext.batchRenderCb.value[this.data.batchId] === this._renderBatch) {
        delete renderContext.batchRenderCb.value[this.data.batchId];
      }
    },
  },
  data: {
    batchNodes:[]
  },
  methods: {
    copyCode(event) {
      this.triggerEvent('codecopy', { text:event.currentTarget.dataset.code }, { bubbles:true, composed:true });
    },
    invokeEvent(name, args) {
      const node = args[0]?.currentTarget?.dataset?.data;
      const attrs = node?.attrs;
      if (name === "tap" && openCitationSource(attrs)) return;
      if (name === 'tap' && node?.webLink) {
        this.triggerEvent('linkcopy', { text:attrs.href }, { bubbles:true, composed:true });
        return;
      }

      const renderContext = getRenderContext(this.data.contextId);
      const handler = renderContext && renderContext.events && renderContext.events[name];
      if (typeof handler === "function") handler(...args);
    },
    bindRenderContext() {
      const renderContext = getRenderContext(this.data.contextId);
      if (!renderContext || this._renderContext) return;
      this._renderContext = renderContext;
      const _this = this
      this._renderBatch = (index, node, callback) => {
        _this.setData({
          [`batchNodes[${index}]`]:
           node
        }, callback);
      };
      renderContext.batchRenderCb.value[this.data.batchId] = this._renderBatch;
    },
  },
});
