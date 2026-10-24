const { normalizeCitations } = require('../../../static_utils/chatSources');

function openCitationSource(attrs) {
	if (attrs?.['data-citation'] !== 'true') return false;
	const citations = normalizeCitations([{ url:attrs.href }]);
	if (citations.length) wx.navigateTo({
		url:'/pages/sourcesPage/index',
		routeType:'upRouterBuilder',
		success:res => res.eventChannel.emit('showSources', { citations }),
		fail:error => {
			console.error('[sources] navigation failed', error);
			wx.showToast({ title:'来源加载失败', icon:'none' });
		}
	});
	return true;
}

module.exports = { openCitationSource };
