//markdown语法特殊字符
const mkSyntaxChars = [
  "\n",
  "\r",
  "\r\n",
  "#",
  "*",
  "_",
  "`",
  ">",
  "[",
  "]",
  "(",
  ")",
  "|",
  "-",
  "+",
  ".",
  "^",
  // "~",
  "\\",
  // ":",
  // "=",
  // "$",
  // "&",
  " ",
];
const towxml = require("./index");
const { messages } = require('../../../static_utils/i18n/index');
const { getThemeStyle } = require('../../../static_utils/theme');
const {
  createRenderContext,
  destroyRenderContext,
  getRenderContext,
  retainRenderContext,
  releaseRenderContext,
} = require("./render-context");

Component({
  options: {
    styleIsolation: "shared",
  },
  properties: {
    mdText: {
      type: Object,
      value: {},
    },
    nodes: {
      type: Object,
      value: {},
    },
    images: { type: Array, value: [] },
    files: { type: Array, value: [] },
    speed: {
      type: Number,
      value: 10,
    },
    isFinish: {
      type: Boolean,
      value: false,
    },
    freeze: { type: Boolean, value: false },
    openTyper: {
      type: Boolean,
      value: true,
    },
    theme: {
      type: String,
      value: "light",
    },
  },
  observers: {
    theme(theme) {
      this.setData({ copyNoticeTheme:getThemeStyle(theme) });
    },
    freeze(value) {
      if (value) this.stopTyping();
    },
    nodes(nodes) {
      if (!this.data.openTyper) {
        this.bindEventContext(nodes && nodes.eventContextId);
      }
      if (this._isReady && !this.data.openTyper) {
        this.setData({ staticNodes: nodes }, () => this.emitStaticReady())
      }
    }
  },
  lifetimes: {
    created: function () {
      if (this.data.openTyper !== false) {
        const renderContext = createRenderContext();
        this._contextId = renderContext.id;
        this._renderContext = renderContext.context;
        this._ownsRenderContext = true;
        this.setData({ contextId: this._contextId });
      } else {
        this.bindEventContext(this.data.nodes && this.data.nodes.eventContextId);
      }
    },
    ready: function () {
      this._isReady = true
      if (this.data.openTyper && !this.isStarted) {
        this.isStarted = true;
        this.startType();
      }
      if (!this.data.openTyper) {
        this.bindEventContext(this.data.nodes && this.data.nodes.eventContextId);
        this.setData({
          staticNodes: this.data.nodes,
        }, () => this.emitStaticReady());
      }
    },
    detached: function () {
      this._destroyed = true;
      if (this._typerTimer) {
        this._typerTimer.cancel();
        this._typerTimer = null;
      }
      if (this._ownsRenderContext) {
        destroyRenderContext(this._contextId);
      } else if (this._eventContextId) {
        releaseRenderContext(this._eventContextId);
      }
    }
  },
  data: {
    copyCloseLabel: messages().archive.close,
    copyNoticeTheme: getThemeStyle('light'),
    staticNodes: {},
    contextId: "",
    batchIds: [0, 1],//先提前创建两个分批组件,方便后面进行隔代创建
    batchSize: 40
  },
  methods: {
    copyText(event) {
      const text = event.detail?.text;
      if (typeof text !== 'string' || !text) return;
      const i18n = messages(wx.getStorageSync('applicationSettings')?.language);
      this.setData({ copyCloseLabel:i18n.archive.close });
      wx.setClipboardData({
        data: text,
        success: () => {
          // 微信剪贴板接口自带成功 toast，立即隐藏后使用顶部胶囊。
          wx.hideToast();
          if (!this._destroyed) this.selectComponent('#copyNotice')?.show(
            event.type === 'linkcopy' ? i18n.sources.copied : i18n.renderer.copySuccess);
        },
        fail: () => {
          if (!this._destroyed) this.selectComponent('#copyNotice')?.show(i18n.renderer.copyFailed);
        }
      });
    },
    syncImageCards(nodes) {
      const artifactIds = [];
      const collect = node => {
        const id = node.generatedImage?.artifactId;
        if (id && !artifactIds.includes(id)) artifactIds.push(id);
        for (const child of node.children || []) collect(child);
      };
      for (const node of nodes) collect(node);
      const key = artifactIds.join(',');
      if (key === (this._imageCardKey || '')) return;
      this._imageCardKey = key;
      this.triggerEvent('imagecards', { artifactIds });
    },
    stopTyping() {
      if (this._stopAtCurrent) return this._typedText || '';
      this._stopAtCurrent = true;
      this._typedText = (this._typedText || '').replace(/[\uD800-\uDBFF]$/, '');
      this.triggerEvent('stopped', { text:this._typedText || '' });
      return this._typedText || '';
    },
    emitStaticReady() {
      if (this._destroyed) return
      this.triggerEvent('ready', {})
    },

    bindEventContext(contextId) {
      if (contextId === this._eventContextId) return;
      if (!contextId) {
        if (this._eventContextId) {
          releaseRenderContext(this._eventContextId);
          this._eventContextId = null;
          this._contextId = "";
          this.setData({ contextId: "" });
        }
        return;
      }
      const renderContext = getRenderContext(contextId);
      if (!renderContext || !renderContext.events) return;
      if (this._eventContextId) {
        releaseRenderContext(this._eventContextId);
      }
      retainRenderContext(contextId);
      this._eventContextId = contextId;
      this._contextId = contextId;
      this.setData({ contextId });
    },
    startType() {
      const _this = this;
      const renderContext = this._renderContext;
      if (!renderContext) return;
      this.dataNodes = [];
      const {
        textRenderCb,
        textInstaceUuid,
        curText,
        batchRenderCb,
      } = renderContext;
      // finishIndex 之前的一级 Markdown 节点已经稳定，只保留尾部重新解析。
      let finishIndex = -1;
      let c = 0;
      let allText = "";
      this._typedText = '';
      let stableFirstLevelChildNodes = [];
      let testAfterMkSyntaxChar = "";
      let tmpUuid = "";
      let index = 0;
      let isNeedFlushIndex = false;
      let lastCurText = "";
      let pendingTreeCacheKey = "";
      let pendingTreeCache = null;
      let pendingTreeImages = null;
      let pendingTreeFiles = null;
      let frameBudgetRemainder = 0;
      let isFinalizing = false;
      const charDelay = Math.max(1, Number(_this.data.speed) || 1);
      // ponytail: cap catch-up work per frame; raise only after long-message profiling.
      const maxFrameChars = 64;

      const parsePendingTree = (end) => {
        const start = Math.max(0, finishIndex);
        const boundedEnd = end === undefined ? allText.length : Math.max(start, end);
        const cacheKey = `${start}:${boundedEnd}`;
        if (cacheKey === pendingTreeCacheKey && pendingTreeCache && pendingTreeImages === this.data.images
            && pendingTreeFiles === this.data.files) {
          return pendingTreeCache;
        }
        pendingTreeCacheKey = cacheKey;
        pendingTreeImages = this.data.images;
        pendingTreeFiles = this.data.files;
        pendingTreeCache = towxml(
          allText.substring(start, boundedEnd),
          "markdown", { theme: this.data.theme, citations: this.data.mdText.citations, images:this.data.images, files:this.data.files }
        );
        return pendingTreeCache;
      };

      this._destroyed = false;
      this._typerTimer = this.customSetInterval((elapsed) => {
        if (_this._destroyed) {
          _this._typerTimer.cancel();
          _this._typerTimer = null;
          return;
        }
        if (isFinalizing) return;
        const streamText = _this._stopAtCurrent ? _this._typedText
          : (_this.data.mdText && typeof _this.data.mdText.text === "string" ? _this.data.mdText.text : "");
        if (batchRenderCb.value[_this.data.batchIds[_this.data.batchIds.length - 1]] == undefined) {
          return
        }
        // Restore only the snapshot prefix; later deltas keep the normal typing budget.
        const initialText = _this.data.mdText?.initialText;
        if (!_this._stopAtCurrent && initialText && initialText.length > c &&
            initialText.startsWith(allText) && streamText.startsWith(initialText)) {
          const tree = towxml(initialText, "markdown", {
            theme:_this.data.theme, citations:_this.data.mdText.citations, images:_this.data.images, files:_this.data.files
          });
          const batchCount = Math.floor(tree.children.length / _this.data.batchSize) + 2;
          if (_this.data.batchIds.length < batchCount) {
            _this.setData({batchIds:Array.from({length:batchCount}, (_, i) => i)});
            return;
          }
          if (_this.data.batchIds.some(id => !batchRenderCb.value[id])) return;
          const previousNodeCount = _this.dataNodes.length;
          finishIndex = -1;
          stableFirstLevelChildNodes = [];
          testAfterMkSyntaxChar = '';
          isNeedFlushIndex = false;
          pendingTreeCacheKey = '';
          frameBudgetRemainder = 0;
          allText = initialText;
          c = initialText.length;
          _this._typedText = initialText;
          _this.dataNodes = tree.children;
          tree.children.forEach((node, i) => {
            batchRenderCb.value[Math.floor(i / _this.data.batchSize)](i % _this.data.batchSize, node);
          });
          for (let i = tree.children.length; i < previousNodeCount; i++) {
            batchRenderCb.value[Math.floor(i / _this.data.batchSize)](i % _this.data.batchSize, {tag:'unknow'});
          }
          _this.syncImageCards(tree.children);
          return;
        }
        if (_this.data.isFinish && c >= streamText.length) {
          isFinalizing = true;
          if (_this._typerTimer) _this._typerTimer.cancel();
          _this._typerTimer = null;
          // 最后一段必须提交到实际渲染的 batchNodes，再通知上层完成。
          // Sources can arrive after earlier blocks were cached; resolve the complete visible body once.
          const objTree = towxml(allText, "markdown", {
            theme: _this.data.theme, citations: _this.data.mdText.citations, images:_this.data.images, files:_this.data.files, streaming:false
          });
          const previousNodeCount = _this.dataNodes.length;
          const finalNodes = objTree.children;
          _this.dataNodes = finalNodes;
          if (textRenderCb.value && typeof textRenderCb.value.flush === "function") {
            textRenderCb.value.flush();
          }

          const updates = objTree.children.map((node, pendingIndex) => {
            const nodeIndex = pendingIndex;
            return {
              node,
              batchNum: Math.trunc(nodeIndex / _this.data.batchSize),
              renderIndex: nodeIndex % _this.data.batchSize,
            };
          });
          for (let nodeIndex = finalNodes.length; nodeIndex < previousNodeCount; nodeIndex++) {
            updates.push({
              node: { tag: "unknow" },
              batchNum: Math.trunc(nodeIndex / _this.data.batchSize),
              renderIndex: nodeIndex % _this.data.batchSize,
            });
          }

          const emitFinish = () => {
            if (_this._destroyed) return;
            _this.syncImageCards(finalNodes);
            _this.triggerEvent("finish", { message: "打字完毕！" });
          };
          if (!updates.length) {
            emitFinish();
            return;
          }
          let pendingUpdates = updates.length;
          updates.forEach(({ node, batchNum, renderIndex }) => {
            batchRenderCb.value[batchNum](renderIndex, node, () => {
              pendingUpdates--;
              if (pendingUpdates === 0) emitFinish();
            });
          });
          return;
        }
        if (!streamText || c >= streamText.length) {
          frameBudgetRemainder = 0;
          return;
        }
        frameBudgetRemainder = Math.min(
          maxFrameChars,
          frameBudgetRemainder + Math.max(0, elapsed) / charDelay
        );
        const frameBudget = Math.min(
          maxFrameChars,
          Math.floor(frameBudgetRemainder)
        );
        frameBudgetRemainder -= frameBudget;

        for (
          let frameIndex = 0;
          frameIndex < frameBudget && c < streamText.length;
          frameIndex++
        ) {
          const singleChar = streamText[c];
          const lastSingleChar = streamText[c - 1];
          c++;
          if (singleChar == undefined) {
            continue;
          }
        allText = allText + singleChar;
        _this._typedText = allText;
        //更新最新的文本组件实例对应的显示文本的第一个字符的位置
        if (isNeedFlushIndex) {
          if (tmpUuid != textInstaceUuid.value) {
            index = c - 2;
          }
          //用来处理以下情况：
          //<think>
          //嗯
          if (
            tmpUuid == textInstaceUuid.value &&
            c - index - 1 !== curText.value.length &&
            curText.value === allText[c - 2] &&
            lastCurText !== curText.value
          ) {
            index = c - 2;
          }
          isNeedFlushIndex = false;
        }
        //当碰到换行符的时候，渲染一下未复用的数据，这个if对应的bug的文本
        //**comm**
        // ```bash
        // conda
        // ```
        if (singleChar.match(/\r?\n/g)) {
          const objTree = parsePendingTree();
          const allNodesSize = objTree.children.length + stableFirstLevelChildNodes.length
          if (allNodesSize >= (_this.data.batchIds.length - 1) * _this.data.batchSize) {
            //当第n个批组件用完了，就创建n+2个批组件，隔代创建，防止batchRenderCb.value[batchNum]为undifined
            const _batchId = Math.trunc(allNodesSize / _this.data.batchSize) + 1
            _this.setData({
              [`batchIds[${_batchId}]`]:
                _batchId,
            })
          }
          for (let i = 0; i < objTree.children.length; i++) {
            _this.dataNodes[stableFirstLevelChildNodes.length + i] =
              objTree.children[i];
            //通过路径的方式，一个个元素地渲染，比直接_this.setData(dataNodes,数组)的方式，效率提高很多

            (function renderNodeWhenEnter() {
              const batchNum = Math.trunc((stableFirstLevelChildNodes.length + i) / _this.data.batchSize)
              const renderIndex = (stableFirstLevelChildNodes.length + i) % _this.data.batchSize
              batchRenderCb.value[batchNum](renderIndex, objTree.children[i])
            })()
          }
          //上一次可能渲染了多余的节点，这次要去掉
          for (
            let x = stableFirstLevelChildNodes.length + objTree.children.length;
            x < _this.dataNodes.length;
            x++
          ) {
            (function renderUnknowNodeWhenEnter() {
              const batchNum = Math.trunc(x / _this.data.batchSize)
              const renderIndex = x % _this.data.batchSize
              batchRenderCb.value[batchNum](renderIndex, { tag: "unknow" })
            })()
          }
          _this.syncImageCards([...stableFirstLevelChildNodes, ...objTree.children]);
        }
        const pendingLink = allText.endsWith('![') || allText.endsWith('](') && _this.data.files?.length ||
          pendingTreeCache?.pendingImage || pendingTreeCache?.pendingLink;
        if (_this.isMkSyntaxChar(lastSingleChar, singleChar) && !pendingLink) {
          testAfterMkSyntaxChar = "";
        } else {
          if (pendingLink) testAfterMkSyntaxChar = "";
          testAfterMkSyntaxChar = testAfterMkSyntaxChar + singleChar;
          if (testAfterMkSyntaxChar.length == 1) {
            isNeedFlushIndex = true;
            tmpUuid = textInstaceUuid.value;
            lastCurText = curText.value;
            const objTree = parsePendingTree();
            if (pendingLink && !objTree.pendingImage && !objTree.pendingLink) testAfterMkSyntaxChar = "";
            const allNodesSize = objTree.children.length + stableFirstLevelChildNodes.length
            if (allNodesSize >= (_this.data.batchIds.length - 1) * _this.data.batchSize) {
              //当第n个批组件用完了，就创建n+2个批组件，隔代创建，防止batchRenderCb.value[batchNum]为undifined
              const _batchId = Math.trunc(allNodesSize / _this.data.batchSize) + 1
              _this.setData({
                [`batchIds[${_batchId}]`]:
                  _batchId,
              })
            }
            for (let i = 0; i < objTree.children.length; i++) {
              _this.dataNodes[stableFirstLevelChildNodes.length + i] =
                objTree.children[i];
              //通过路径的方式，一个个元素地渲染，比直接_this.setData(dataNodes,数组)的方式，效率提高很多
              (function renderNode() {
                const batchNum = Math.trunc((stableFirstLevelChildNodes.length + i) / _this.data.batchSize)
                const renderIndex = (stableFirstLevelChildNodes.length + i) % _this.data.batchSize
                batchRenderCb.value[batchNum](renderIndex, objTree.children[i])
              })()
            }
            //上一次可能渲染了多余的节点，这次要去掉
            for (
              let x =
                stableFirstLevelChildNodes.length + objTree.children.length;
              x < _this.dataNodes.length;
              x++
            ) {
              (function renderUnknowNode() {
                const batchNum = Math.trunc(x / _this.data.batchSize)
                const renderIndex = x % _this.data.batchSize
                batchRenderCb.value[batchNum](renderIndex, { tag: "unknow" })
              })()
            }
            _this.syncImageCards([...stableFirstLevelChildNodes, ...objTree.children]);
            //以下是判断是否可以复用的逻辑，复用的条件就是：当最新的内容转化出来有n个节点，那么只有第n个是可能不完整的，前n-1个是可以复用的
            //allText.substring(finishIndex, allText.length - 1)截至是 allText.length - 1而不是allText.length，是为了避免1. 2.这种有序列表情况触发的问题，因为1，2不是markdown特殊语法字符，但是1. 却是
            const curNewNodes = parsePendingTree(
              Math.max(Math.max(0, finishIndex), allText.length - 1)
            );
            const curNewNodesNum = Math.min(
              curNewNodes.children.length,
              objTree.children.length
            );
            if (curNewNodesNum >= 2) {
              let j = allText.length - 1;
              while (true) {
                //allText[j - 1].match( /\r?\n/g) 这句话也是为了避免1. 2.这种有序列表情况触发的问题,同时对复用加以限制，每次在换行处才可能可以复用，即：curNewNodesNum >= 2 时不一定就能复用成功，还得以换行为单位
                //应该判断allText[j - 1] && allText[j - 1].match(/\r?\n/g) 和 tmpNodes.children.length <= curNewNodesNum - 1同时成立，拆成两个if,提高效率
                if (allText[j - 1] && allText[j - 1].match(/\r?\n/g)) {
                  const tmpNodes = parsePendingTree(j);
                  if (tmpNodes.children.length <= curNewNodesNum - 1) {
                    for (let i = 0; i < tmpNodes.children.length; i++) {
                      stableFirstLevelChildNodes.push(objTree.children[i]);
                    }
                    finishIndex = j;
                    break;
                  }
                }
                j--;
              }
            }
          } else {
            if (textRenderCb.value && singleChar) {
              //产生了新的文本实例，一段连续显示的文本中还没有碰到特殊markdown字符
              if (tmpUuid != textInstaceUuid.value) {
                textRenderCb.value(singleChar);
                continue;
              } else {
                //没有产生新的文本实例，一段连续显示的文本中碰到了特殊markdown字符，但是这个特殊字符是正常显示
                if (c - index - 1 === curText.value.length) {
                  textRenderCb.value(singleChar);
                  continue;
                }
                //markdown字符串中转义的情况
                if (
                  _this.unescapeMarkdown(allText.substring(index, c - 1))
                    .length === curText.value.length
                ) {
                  textRenderCb.value(singleChar);
                  continue;
                }
                //没有产生新的文本实例，一段连续显示的文本中碰到了特殊markdown字符，但是特殊字符不是正常显示，最后那个正常字符确正常显示
                //<think>
                //嗯
                if (
                  c - index - 1 !== curText.value.length &&
                  curText.value === allText[c - 2] &&
                  lastCurText !== curText.value
                ) {
                  textRenderCb.value(singleChar);
                  continue;
                }
                //还有一种情况,不做处理：没有产生新的文本实例，一段连续显示的文本中碰到了特殊markdown字符，但是特殊字符不是正常显示，最后那个正常字符确不正常显示，如：
                //# hello
                //```python
              }
            }
          }
        }
        }
      }, _this.data.speed)
    },
    isMkSyntaxChar(c1, c2) {
      const ar1 = [" ", "+", ":", "(", "-"];
      const ar3 = ["*", "_", "`", "~"]; //ar3中包含的markdwon字符是可能有意义的
      const spaceLikeCodes = [160, 8203, 8204, 8205, 8239, 12288]; //长得像空格的特殊码值
      // 不间断空格	160
      // 零宽空格	8203
      // 零宽不连字	8204
      // 零宽连字	8205
      // 窄空格	8239
      // 全角空格	12288
      if (spaceLikeCodes.includes(c2.charCodeAt(0))) {
        return true;
      }
      if (ar3.includes(c2)) {
        return true;
      }
      if (ar1.includes(c2) && !mkSyntaxChars.includes(c1)) {
        return false;
      }
      if (!/^\d$/.test(c1) && c2 === ".") {
        return false;
      }
      return (
        mkSyntaxChars.includes(c2) || c2.match(/\r?\n/g) || c2.match(/\t/g)
      );
    },
    unescapeMarkdown(text) {
      // 定义常见的 Markdown 转义字符及其对应的原始字符
      const escapeChars = {
        "\\*": "*",
        "\\_": "_",
        "\\#": "#",
        "\\+": "+",
        "\\-": "-",
        "\\.": ".",
        "\\`": "`",
        "\\[": "[",
        "\\]": "]",
        "\\(": "(",
        "\\)": ")",
        "\\!": "!",
        "\\>": ">",
      };
      let unescapedText = text;
      for (const [escaped, original] of Object.entries(escapeChars)) {
        unescapedText = unescapedText.replaceAll(escaped, original);
      }
      return unescapedText;
    },
    // 通过 setTimeout 按帧调度，回调内部按 speed 折算本帧需要消费的字符数。
    customSetInterval(callback, delay) {
      let timer = null;
      let isRunning = true;
      const charDelay = Math.max(1, Number(delay) || 1);
      const frameDelay = 16;
      let lastRun = Date.now();
      let firstRun = true;
      const run = () => {
        if (!isRunning) return;
        const start = Date.now();
        const elapsed = firstRun ? charDelay : Math.max(0, start - lastRun);
        firstRun = false;
        lastRun = start;
        try {
          callback(elapsed);
        } catch (error) {
          console.error('回调函数执行出错:', error);
        }
        if (!isRunning) return;
        const end = Date.now();
        const actualTime = end - start;
        const nextDelay = Math.max(1, frameDelay - actualTime);
        if (timer !== null) {
          clearTimeout(timer);
        }
        timer = setTimeout(run, nextDelay);
      };
      run();
      return {
        cancel: () => {
          if (!isRunning) return;
          isRunning = false;
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        }
      };
    }
  },
});
