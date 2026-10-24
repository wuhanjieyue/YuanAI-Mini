const config = require('../config');
const { messages } = require('../../../../static_utils/i18n/index');
Component({
	options: {
		styleIsolation: 'shared'
	},
	properties: {
			theme: { type: String, value: 'light' },
		data: {
			type: Object,
			value: {}
		}
	},
	data: {
		size:{
			w:0,
			h:0
		},
		styleObj:{},
			generatedImages:[],
		error:false
	},
		observers: {
			data() { this.updateSource(); }
		},
	lifetimes:{
		attached:function(){
				const language = wx.getStorageSync('applicationSettings')?.language;
				this.setData({ language, i18n:messages(language) });
				this.updateSource();
			}
		},
		methods: {
			unavailable() {
				this.triggerEvent('unavailable', {}, { bubbles:true, composed:true });
			},
			updateSource() {
				const generatedImage = this.data.data?.generatedImage;
				if (generatedImage) {
					this.setData({generatedImages:[generatedImage]});
					return;
				}
			const _ts = this;
				const dataAttr = this.data.data?.attrs || {};
				_ts.data.size = {w:0, h:0};
				_ts.data.styleObj = {};

			// 将图片大小处理到对象中
			if(dataAttr.width){
				_ts.data.size.w = +dataAttr.width / config.dpr;
			};

			if(dataAttr.height){
				_ts.data.size.h = +dataAttr.height / config.dpr;
			};

			// 将样式合并到样式对象中
			if(dataAttr.style){
				let re = /;\s{0,}/ig;
				dataAttr.style = dataAttr.style.replace(re,';');
				dataAttr.style.split(';').forEach(item => {
					let itemArr = item.split(':');
					if(/^(width|height)$/i.test(itemArr[0])){
						let num = parseInt(itemArr[1]) || 0,
							key = '';
						// itemArr[1] = num / config.dpr + itemArr[1].replace(num,'');
						switch (itemArr[0].toLocaleLowerCase()) {
							case 'width':
								key = 'w';
							break;
							case 'height':
								key = 'h';
							break;
						};
						_ts.data.size[key] = num / config.dpr;
					}else{
						_ts.data.styleObj[itemArr[0]] = itemArr[1];
					};
				});
			};

			// 设置公式图片
			_ts.setData({
				attrs:{
					src:dataAttr.src,
					class:dataAttr.class,
					style:_ts.setStyle(_ts.data.styleObj)
				},
					generatedImages:[],
				size:_ts.data.size,
				error:false
			});
			},
		// 设置图片样式
		setStyle:function(o){
			let str = ``;
			for(let key in o){
				str += `${key}:${o[key]};`;
			};
			return str;
		},

		// 图片加载完成设置图片大小
		load:function(e){
			const _ts = this;
			const width = Number(e.detail && e.detail.width);
			const height = Number(e.detail && e.detail.height);

			if (!(width > 0 && height > 0)) {
				_ts.setData({error:true});
				return;
			};

			if(!_ts.data.size.w || !_ts.data.size.h){
				_ts.setData({
					size:{
						w:width / config.dpr,
						h:height / config.dpr
					},
					error:false
				});
				return;
			};

			_ts.setData({error:false});
		},

		// 图片加载失败保留可见占位，避免失败节点变成空白。
		error:function(){
			if (this.data.attrs && this.data.attrs.src) {
				this.setData({error:true});
			}
		}
	}
})
