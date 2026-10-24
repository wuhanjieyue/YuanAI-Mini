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
	observers: {
		'data, theme': function(){
			this.updateSource();
		}
	},
	data: {
		attrs:{
			src:'',
			class:''
		},
		size:{
			// Skyline 下不能以 0 尺寸等待 bindload，否则图片可能永远不进入解码流程。
			w:2,
			h:2
		},
		error:false
	},
	lifetimes:{
		attached:function(){
			this.setData({ i18n:messages(wx.getStorageSync('applicationSettings')?.language) });
			this.updateSource();
		}
	},
	methods: {
		updateSource:function(){
			const dataAttr = (this.data.data && this.data.data.attrs) || {};
			const value = dataAttr.value || '';
			const currentAttrs = this.data.attrs || {};
			if (!value) {
				if (currentAttrs.src) this.setData({attrs:{src:'',class:''},size:{w:2,h:2},error:false});
				return;
			}

			const attrs = {
				src:`${config.latex.api}=${encodeURIComponent(value)}&theme=${encodeURIComponent(this.data.theme)}&v=${config.version}`,
				class:`${dataAttr.class || ''} ${dataAttr.class || ''}--${dataAttr.type || 'line'}`
			};
			if (attrs.src === currentAttrs.src && attrs.class === currentAttrs.class) return;

			this.setData({
				attrs,
				size:{w:2,h:2},
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

			// 公式图片加载完成则根据其图片大小、类型计算其显示的合适大小
			let scale = 40,
				w = width / scale * 32,
				h = height / scale * 32;

			_ts.setData({
				size:{
					w:w,
					h:h
				},
				error:false
			});
		},
		error:function(){
			if (this.data.attrs.src) this.setData({error:true});
		}
	}
})
