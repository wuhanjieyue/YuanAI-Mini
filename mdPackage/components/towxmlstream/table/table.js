Component({
	options: {
		styleIsolation: 'shared',
		virtualHost: true
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
	}
})
