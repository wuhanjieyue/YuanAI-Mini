export default class WxCanvas {
  constructor(ctx, canvasId, canvasNode) {
    this.ctx = ctx;
    this.canvasId = canvasId;
    this.canvasNode = canvasNode;
    this.chart = null;

    this._initEvent();
  }

  getContext(contextType) {
    if (contextType === '2d') {
      return this.ctx;
    }
  }

  // canvasToTempFilePath(opt) {
  //   if (!opt.canvasId) {
  //     opt.canvasId = this.canvasId;
  //   }

  //   return wx.canvasToTempFilePath(opt, this);
  // }

  setChart(chart) {
    this.chart = chart;
  }

  attachEvent () {
    // noop
  }

  addEventListener() {
    // noop
  }

  detachEvent() {
    // noop
  }

  _initEvent() {
    this.event = {};
    const eventNames = [{
      wxName: 'touchStart',
      ecName: 'mousedown'
    }, {
      wxName: 'touchMove',
      ecName: 'mousemove'
    }, {
      wxName: 'touchEnd',
      ecName: 'mouseup'
    }, {
      wxName: 'touchEnd',
      ecName: 'click'
    }];

    eventNames.forEach(name => {
      this.event[name.wxName] = e => {
        const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
        if (!touch || !this.chart) return;
        this.chart.getZr().handler.dispatch(name.ecName, {
          zrX: name.wxName === 'tap' ? touch.clientX : touch.x,
          zrY: name.wxName === 'tap' ? touch.clientY : touch.y
        });
      };
    });
  }

  set width(value) {
    if (this.canvasNode) this.canvasNode.width = value;
  }

  set height(value) {
    if (this.canvasNode) this.canvasNode.height = value;
  }

  get width() {
    return this.canvasNode ? this.canvasNode.width : 0;
  }

  get height() {
    return this.canvasNode ? this.canvasNode.height : 0;
  }
}
