const config = require('../config');
const { messages } = require('../../../../static_utils/i18n/index');
Component({
	options: {
		styleIsolation: 'shared'
	},
	properties: {
		data: {
			type: Object,
			value: {}
		},
		theme: {
			type: String,
			value: 'light'
		}
	},
	data: {
		attr:{
			src:'',
			class:'',
			format:'yuml',
			mode:'aspectFill'
		},
		size:{
			// Skyline 下不能以 0 尺寸等待 bindload，否则图片可能永远不进入解码流程。
			w:2,
			h:2
		},
		error:false,
	},
	observers: {
    'data, theme': function () { this.updateSource() }
  },
  lifetimes: {
    attached() {
      this.setData({ i18n: messages(wx.getStorageSync('applicationSettings')?.language) })
      this.updateSource()
    }
  },
	methods: {
    updateSource() {
			const _ts = this;
			const dataAttr = (this.data.data && this.data.data.attrs) || {};
			const format = dataAttr.format === 'mermaid' ? 'mermaid' : 'yuml';
			const api = config[format].api;

			_ts.setData({
				attr:{
					src:`${api}=${encodeURIComponent(dataAttr.value || '')}&theme=${encodeURIComponent(this.data.theme)}&v=${config.version}`,
					class:`${dataAttr.class || ''}`,
					format:format,
					mode:format === 'mermaid' ? 'aspectFit' : 'aspectFill'
				},
				error:false
			});
    },
		load:function(e){
			const _ts = this;
			const width = Number(e.detail && e.detail.width);
			const height = Number(e.detail && e.detail.height);
			if (!(width > 0 && height > 0)) {
				_ts.setData({error:true});
				return;
			}
			const renderScale = 2;
			const scale = 20 * renderScale;
			const w = width / scale * 32;
			const h = height / scale * 32;
			_ts.setData({
				size:{
					w:w,
					h:h
				},
				error:false
			});
		},
		error:function(){
			if (this.data.attr.src) this.setData({ error:true });
		}
	}
})
