const config = require('./config');
const { getRenderContext } = require('./render-context');
const { openCitationSource } = require('./citation');

Component({
	options: {
		styleIsolation: 'apply-shared',
		virtualHost: true
	},
	properties: {
    theme: { type: String, value: 'light' },
		nodes: {
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
	lifetimes: {
		attached: function () {
			const _ts = this;

			config.events.forEach(item => {
				_ts['_' + item] = function (...arg) {
					_ts.invokeEvent(item, arg);
				};
			});
		}
	},
	methods: {
		copyCode(event) {
			this.triggerEvent('codecopy', { text:event.currentTarget.dataset.code }, { bubbles:true, composed:true });
		},
		invokeEvent(name, args) {
			const node = args[0]?.currentTarget?.dataset?.data;
			const attrs = node?.attrs;
			if(name === 'tap' && node?.artifactLink){
				this.triggerEvent('artifactlink', { link:attrs?.href || '' }, { bubbles:true, composed:true });
				return;
			}
			if(name === 'tap' && openCitationSource(attrs)) return;

			const renderContext = getRenderContext(this.data.contextId);
			const handler = renderContext && renderContext.events && renderContext.events[name];
			if (typeof handler === 'function') handler(...args);
		}
	}
})
