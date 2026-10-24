const { getRenderContext } = require("../render-context");
Component({
  options: {
    styleIsolation: "shared",
    virtualHost: true,
  },
  properties: {
    text: {
      type: String,
      value: "",
    },
    contextId: {
      type: String,
      value: "",
    },
  },
  observers: {
    text: function (newVal) {
      this.showText = newVal || "";
      if (this._renderContext) {
        this._renderContext.curText.value = this.showText;
      }
      this.setData({ showText: this.showText });
    },
    contextId() {
      this.bindRenderContext();
    },
  },
  lifetimes: {
    attached: function () {
      this._detached = false;
      this._renderTimer = null;
      this.bindRenderContext();
    },
    detached: function () {
      this._detached = true;
      if (this._renderTimer !== null) {
        clearTimeout(this._renderTimer);
        this._renderTimer = null;
      }
      const renderContext = this._renderContext;
      if (renderContext && renderContext.textRenderCb.value === this._renderText) {
        renderContext.textRenderCb.value = undefined;
      }
      if (renderContext && renderContext.textInstaceUuid.value === this._textUuid) {
        renderContext.textInstaceUuid.value = undefined;
        renderContext.curText.value = '';
      }
    },
  },
  data: {
    showText: "",
  },
  methods: {
    bindRenderContext() {
      const renderContext = getRenderContext(this.data.contextId);
      if (!renderContext || this._renderContext) return;
      const initialText = this.data.text || "";
      this._renderContext = renderContext;
      renderContext.curText.value = initialText;
      this._textUuid = this.generateUUIDWithTimestamp();
      renderContext.textInstaceUuid.value = this._textUuid;
      this.showText = initialText;
      this.setData({ showText: this.showText });
      const _this = this;
      this._flushText = () => {
        if (_this._renderTimer !== null) {
          clearTimeout(_this._renderTimer);
          _this._renderTimer = null;
        }
        if (!_this._detached) {
          _this.setData({ showText: _this.showText });
        }
      };
      this._renderText = (newText) => {
        _this.showText = _this.showText + newText;
        renderContext.curText.value = _this.showText;
        if (_this._renderTimer !== null) return;
        _this._renderTimer = setTimeout(() => {
          _this._renderTimer = null;
          _this._flushText();
        }, 16);
      };
      this._renderText.flush = this._flushText;
      renderContext.textRenderCb.value = this._renderText;
    },
    show() {
      this.setData({ isShow: true });
    },
    //生成uuid
    generateUUIDWithTimestamp() {
      const timestamp = new Date().getTime().toString(16);
      const s = [];
      const hexDigits = "0123456789abcdef";
      let index = 0;
      // 先填充时间戳部分
      for (let i = 0; i < Math.min(8, timestamp.length); i++) {
        s.push(timestamp[i]);
        index++;
      }
      // 继续填充随机数
      for (; index < 36; index++) {
        if ([8, 13, 18, 23].includes(index)) {
          s.push("-");
        } else if (index === 14) {
          s.push("4"); // bits 12 - 15 of the time_hi_and_version field to 0010
        } else if (index === 19) {
          s.push(hexDigits.substr((Math.random() * 4) | 0x8, 1)); // bits 6 - 7 of the clock_seq_hi_and_reserved to 01
        } else {
          s.push(hexDigits.substr(Math.floor(Math.random() * 0x10), 1));
        }
      }

      const uuid = s.join("");
      return uuid;
    },
  },
});
