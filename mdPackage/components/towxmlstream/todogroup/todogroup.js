const { getRenderContext } = require('../render-context');

Component({
	options: {
		styleIsolation: 'shared'
	},
	properties: {
		data: {
			type: Object,
			value: {}
		},
		streamMode: {
			type: Boolean,
			value: true
		},
		contextId: {
			type: String,
			value: ''
		}
	},
	data: {
	},
	methods: {
		_change:function(...arg){
			const renderContext = getRenderContext(this.data.contextId);
			const handler = renderContext && renderContext.events && renderContext.events.change;
			if (typeof handler === 'function') handler(...arg);
		}
	}
})
