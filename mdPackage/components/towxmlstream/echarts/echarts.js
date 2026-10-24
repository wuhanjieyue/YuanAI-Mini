import WxCanvas from './wx-canvas';
import * as echarts from './wx-echarts';
const darkTheme = require('./dark');

Component({
	properties: {
		canvasId: {
			type: String,
			value: 'ec-canvas'
		},

		data: {
			type: Object,
			value: {}
		},

		ec: {
			type: Object,
			value: {}
		},

		theme: {
			type: String,
			value: 'light',
      observer() {
        if (!this.chart || !this._wxCanvas) return
        const current = this.chart.getOption()
        const option = Object.assign({}, this._themeOption || current)
        if (current.dataZoom && this._themeOption) {
          const original = Array.isArray(option.dataZoom) ? option.dataZoom : [option.dataZoom || {}]
          option.dataZoom = original.map((item, i) => Object.assign({}, item, {
            start: current.dataZoom[i]?.start, end: current.dataZoom[i]?.end
          }))
        }
        if (current.legend && this._themeOption) {
          const original = Array.isArray(option.legend) ? option.legend : [option.legend || {}]
          option.legend = original.map((item, i) => Object.assign({}, item, { selected: current.legend[i]?.selected }))
        }
        const width = this.chart.getWidth(), height = this.chart.getHeight()
        this.chart.dispose()
        echarts.registerTheme('dark', darkTheme)
        this.chart = echarts.init(this._wxCanvas, this.data.theme === 'dark' ? 'dark' : null, { width, height })
        this._wxCanvas.setChart(this.chart)
        this.chart.setOption(option)
      }
		}
	},

	data: {
		size: {
			height: 240
		}
	},

	ready: function () {
		const ec = this._ec || this.data.ec;
		if (!ec) {
			console.warn('组件需绑定 ec 变量，例：<ec-canvas id="mychart-dom-bar" ' +
				'canvas-id="mychart-bar" ec="{{ ec }}"></ec-canvas>');
			return;
		}

		if (!ec.lazyLoad) {
			this.init();
		}
	},
	lifetimes: {
		attached: function () {
			const _ts = this;
			const dataAttr = this.data.data && this.data.data.attrs;
			const ec = Object.assign({}, this.data.ec || {});

			if (dataAttr && dataAttr.value) {
				let obj;
				try {
					obj = JSON.parse(decodeURIComponent(dataAttr.value));
				} catch (error) {
					console.error('ECharts 数据解析失败:', error);
					return;
				}
				obj.option = obj.option || {};
				obj.option.color = ['#60acfc', '#32d3eb', '#5bc49f', '#feb64d', '#ff7c7c', '#9287e7'];
                this._themeOption = obj.option;
				if (obj.height) {
					_ts.setData({
						size: {
							height: obj.height
						}
					})
				}
				ec.onInit = function (canvas, width, height) {
					echarts.registerTheme('dark', darkTheme);
					const theme = _ts.data.theme === 'dark' ? 'dark' : null,
						chart = echarts.init(canvas, theme, {
							width: width,
							height: height
						});
					canvas.setChart(chart);

					chart.setOption(obj.option);
					return chart;
				};
			}
			_ts._ec = ec;
		},
		moved: function () {},
		detached: function () {
			if (this.chart && typeof this.chart.dispose === 'function') {
				this.chart.dispose();
			}
			this.chart = null;
			this._canvasNode = null;
            this._wxCanvas = null;
		},
	},
	methods: {
		init: function (callback) {
			const version = wx.version.version.split('.').map(n => parseInt(n, 10));
			const isValid = version[0] > 1 || (version[0] === 1 && version[1] > 9) ||
				(version[0] === 1 && version[1] === 9 && version[2] >= 91);
			if (!isValid) {
				console.error('微信基础库版本过低，需大于等于 1.9.91。');
				return;
			}

			const ec = this._ec || this.data.ec;
			const query = this.createSelectorQuery();
			query.select('.ec-canvas').fields({ node: true, size: true }).exec(res => {
				const info = res && res[0];
				if (!info || !info.node) {
					console.error('Skyline Canvas 2D 节点获取失败');
					return;
				}
				const canvasNode = info.node;
				const canvas = new WxCanvas(canvasNode.getContext('2d'), this.data.canvasId, canvasNode);
				this._canvasNode = canvasNode;
                this._wxCanvas = canvas;
				echarts.setCanvasCreator(() => canvas);

				if (typeof callback === 'function') {
					this.chart = callback(canvas, info.width, info.height);
				} else if (ec && typeof ec.onInit === 'function') {
					this.chart = ec.onInit(canvas, info.width, info.height);
				} else {
					this.triggerEvent('init', {
						canvas: canvas,
						width: info.width,
						height: info.height
					});
				}
			});
		},

		canvasToTempFilePath(opt = {}) {
			const query = this.createSelectorQuery();
			query.select('.ec-canvas').fields({ node: true }).exec(res => {
				const canvas = res && res[0] && res[0].node;
				if (!canvas) return;
				wx.canvasToTempFilePath(Object.assign({}, opt, { canvas }));
			});
		},

		touchStart(e) {
			if (this.chart && e.touches && e.touches.length > 0) {
				var touch = e.touches[0];
				var handler = this.chart.getZr().handler;
				handler.dispatch('mousedown', {
					zrX: touch.x,
					zrY: touch.y,
					preventDefault: () => {},
					stopImmediatePropagation: () => {},
					stopPropagation: () => {}
				});
				handler.dispatch('mousemove', {
					zrX: touch.x,
					zrY: touch.y,
					preventDefault: () => {},
					stopImmediatePropagation: () => {},
					stopPropagation: () => {}
				});
				handler.processGesture(wrapTouch(e), 'start');
			}
		},

		touchMove(e) {
			if (this.chart && e.touches && e.touches.length > 0) {
				var touch = e.touches[0];
				var handler = this.chart.getZr().handler;
				handler.dispatch('mousemove', {
					zrX: touch.x,
					zrY: touch.y,
					preventDefault: () => {},
					stopImmediatePropagation: () => {},
					stopPropagation: () => {}
				});
				handler.processGesture(wrapTouch(e), 'change');
			}
		},

		touchEnd(e) {
			if (this.chart) {
				const touch = e && ((e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]));
				if (!touch) return;
				var handler = this.chart.getZr().handler;
				handler.dispatch('mouseup', {
					zrX: touch.x,
					zrY: touch.y,
					preventDefault: () => {},
					stopImmediatePropagation: () => {},
					stopPropagation: () => {}
				});
				handler.dispatch('click', {
					zrX: touch.x,
					zrY: touch.y,
					preventDefault: () => {},
					stopImmediatePropagation: () => {},
					stopPropagation: () => {}
				});
				handler.processGesture(wrapTouch(e), 'end');
			}
		}
	}
});

function wrapTouch(event) {
	const touches = event && event.touches ? event.touches : [];
	for (let i = 0; i < touches.length; ++i) {
		const touch = touches[i];
		touch.offsetX = touch.x;
		touch.offsetY = touch.y;
	}
	return event;
}
