module.exports = {
  common: {
    confirm: '确认', cancel: '取消', save: '保存', send: '发送', delete: '删除', edit: '编辑', copy: '复制', copied: '已复制', done: '完成',
    retry: '请重试', loading: '加载中', loadFailed: '加载失败', requestFailed: '请求失败', operationFailed: '操作失败，请重试',
    saved: '已保存', sent: '已发送', on: '开', off: '关', enabled: '已授权', search: '搜索', file: '文件', image: '图片',
    document: '文档', camera: '相机', photo: '照片', plugin: '插件', default: '默认', system: '系统', overview: '概览',
    justNow: '刚刚', learnMore: '了解更多', comingSoon: '敬请期待上线'
  },
  auth: {
    login: '登录', loggingIn: '登录中', loggedIn: '已登录', loginFailed: '登录失败', logout: '退出登录', loggingOut: '退出中',
    loggedOut: '已退出登录', logoutFailed: '退出失败', phoneAuthIncomplete: '未完成手机号授权', loginRequired: '请先登录后使用',
    upgradeRequired: '请升级至 {plan}'
  },
  home: { chat: '聊天', library: '库', tasks: '计划任务', knowledge: '知识库', create: '创作' },
  chat: {
    askBot: '向Yuan Bot提问吧', connections: '连接',
    disclaimer: 'Yuan是AI，可能会犯错，请核查重要信息。',
    askAnything: '询问任何问题', newChat: '新对话', temporary: '临时聊天', temporaryShort: '临时', work: 'Yuan Bot',
    temporaryNotice: '本次聊天已停用记忆，且不会出现在你的历史记录中。',
    temporaryPrivacy: '此聊天不会用于训练我们的模型。出于安全目的，我们可能会将此聊天的副本保留30天。',
    ready: '有问题，尽管问', workReady: '专属于你的云端助理机器人', inDevelopment: '此功能正在开发中', share: '分享', pin: '置顶', unpin: '取消置顶', archive: '归档', smart: '深入思考',
    temporaryActionUnavailable: '临时聊天不能置顶或归档',
    transcription: '正在识别', voiceHint: '向上拖动以进行语言输入', microphoneTitle: '提示',
    microphoneMessage: '检测到您没有授权小程序使用麦克风，是否去设置打开？', responding: '当前对话响应中', stopping: '正在停止', stopped: '已停止',
    regenerate: '重新生成', retry: '重试', branch: '创建聊天分支', readAloud: '朗读',
    usedModel: '已使用 {model}', defaultModel: '默认模型', searchWeb: '搜索网页', deepResearch: '深度研究', moreActions: '更多操作',
    offline: '已离线，联网后继续同步',
    reconnecting: '正在重新连接', waitingToSend: '等待发送',
    generating: '正在生成',
    sessionLoadFailed: '会话加载失败', historyLoadFailed: '更早消息加载失败', modelLoadFailed: '模型目录加载失败，请重试',
    fallback: '我好像有点不舒服，让我歇一会吧！', feedbackLocalUnsupported: '本地消息暂不支持反馈',
    quotaInsufficient: '额度不够啦，补充后就能继续使用。',
    quotaReservedBusy: '额度还在处理中，请稍后再试。',
    feedbackUnavailable: '反馈请求未初始化', feedbackFailed: '反馈保存失败', copyMessage: '复制', editMessage: '编辑',
    feedback: '评价回复', like: '良好回复', dislike: '回复不佳'
  },
  speech: {
    loading:'合成中…', play:'继续朗读', pause:'暂停朗读', rate:'播放速度',
    rewind:'后退15秒', forward:'快进15秒', close:'停止朗读并关闭',
    failed:'朗读失败，请稍后重试', tooLong:'这条回复过长，暂时无法朗读', busy:'朗读服务正忙，请稍后重试'
  },
  dictation: {
    failed:'语音识别失败，请稍后重试', empty:'没有识别到语音，请重试',
    busy:'语音识别正忙，请稍后重试', recordFailed:'录音失败，请检查麦克风权限', interrupted:'录音已被系统中断'
  },
  attachments: {
    uploadFailed: '文件上传失败', attachmentUploadFailed: '附件上传失败', deleteFailed: '文件删除失败',
    pending: '附件尚未上传完成', uploading: '附件正在上传，请稍候', limit: '单条消息最多添加 9 个附件',
    guestTooLarge: '未登录时单次上传最多 5 MB',
    tooLarge: '单个附件不能超过 {limit} MB',
    unsupportedFormat: '不支持该附件格式，请选择文本/代码文件、Office、PDF 或常见图片'
  },
  tools: {
    image: '创建图片', imageDesc: '可视化呈现任何内容', research: '深度研究', researchDesc: '获取详细报告',
    webSearch: '网页搜索', webSearchDesc: '查找实时新闻和信息', study: '研究与学习', studyDesc: '帮助您快速掌握新的知识',
    agent: '代理模式', agentDesc: '助您高效工作', addFile: '添加文件', addFileDesc: '分析或总结', enableKnowledge: '启用知识库'
  },
  plugins: {
    skills: '技能', tools: '工具', plugins: '插件', skillsSearch: '搜索技能', toolsSearch: '搜索工具',
    skillsEmpty: '暂无可用技能', toolsEmpty: '暂无可用工具', pluginsEmpty: '暂无可用插件',
    mcpFilter: 'MCP 类型', mcpAll: '全部', mcpDeveloper: '开发者工具', mcpSearch: '搜索工具',
    mcpData: '数据查询', mcpContent: '内容生成', mcpBusiness: '企业服务', mcpLife: '生活服务',
    skillFilter: '技能分类', skillGeneral: '通用工具', skillDevelopment: '开发运维', skillFinance: '金融服务',
    skillBusiness: '企业经营', skillContent: '内容创作', skillLife: '生活服务', skillEducation: '科研教育',
    skillOffice: '办公效率', skillLegal: '法律合规', skillHealth: '健康医疗', skillData: '数据分析',
    tryMcp: '试用此工具', mcpUnavailable: '工具试用暂未开放',
    updatedAt: '数据修改时间', trySkill: '试用此技能', tryUnavailable: '技能试用暂未开放',
    installed: '已安装', recommended: '推荐', search: '搜索插件', clearSearch: '清除搜索',
    empty: '暂无可用skill', more: '更多操作', install: '启用', preview: '预览'
  },
  library: {
    grid: '网格', list: '列表', filter: '筛选', uploaded: '用户上传', generated: '系统生成',
    favorites: '收藏',
    title: '文件库', search: '搜索文件库', all: '全部', images: '图片', documents: '文档', myFiles: '我的文件',
    inspiration: '灵感图片', notes: '项目笔记', resume: '简历与资料', reading: '阅读清单', photos: '图片收藏'
  },
  knowledge: {
    added: '已添加到知识库', addFailed: '添加到知识库失败，请重试',
    statusFailed: '无法确认知识库状态，请重新打开菜单',
    viewOriginal: '查看原文', chunks: '分块列表', chunk: '分块', chunkNumber: '分块 {number}', open: '打开',
    noChunks: '暂无分块', unavailable: '资料不存在或不可访问',
    search: '搜索知识库', clearSearch: '清除搜索', add: '添加到知识库', note: '笔记', uploadFile: '上传文件',
    chooseFailed: '选择失败，请重试', empty: '点击 + 添加文件或图片', remove: '从知识库中删除', deletePrompt: '从知识库中移除“{name}”？原文件仍保留在文件库中。'
  },
  create: {
    clearSearch: '清除搜索',
    search: '搜索创作', noMatches: '没有找到匹配的作品',
    noPrompt: '这张图片暂无提示词', shareFailed: '分享失败，请重试', tryPrompt: '试试此提示词', takePhoto: '拍照', choosePhoto: '选择一张照片',
    templates: '模版', popular: '热门', mine: '我创作的',
    empty: '在聊天中生成图片后，作品会出现在这里',
    samples: { poster: '海报', interior: '室内设计', logo: 'Logo', illustration: '插画', portrait: '人像', icons: '图标' }
  },
  assets: {
    addFavorite: '添加到收藏夹', removeFavorite: '从收藏中移除',
    favoriteAdded: '已添加到收藏夹', favoriteRemoved: '已从收藏中移除',
    favoriteAddFailed: '添加收藏失败，请重试', favoriteRemoveFailed: '移除收藏失败，请重试',
    getMoreStorage: '获取更多容量',
    spaceInsufficient: '空间不足', fileDeleted: '文件已被删除', imageDeleted: '此图像已被删除', deleted: '已删除', renameFileTitle: '重命名文件', deleteFileTitle: '删除文件？',
    empty: '在聊天中上传的图片和文件会出现在这里', noMatches: '没有找到匹配的文件',
    imageUnavailable: '图片暂不可用，点击刷新', generatedImage: '生成的图片',
    previewUnsupported: '暂不支持预览此类型文件', previewFailed: '文件预览失败，请重试',
    downloadFailed: '文件下载失败，请重试',
    preparingFile: '正在准备文件…',
    uploadedAt: '上传于', end: '已显示全部', unavailable: '暂未开放',
    savePhoto: '保存到照片', saveFile: '保存到文件', chat: '聊聊这个', rename: '重命名', move: '移动',
    deleteLibrary: '从库中删除', deleteCreation: '删除作品',
    photoSaved: '图片已保存', photoSaveFailed: '图片保存失败，请重试', photoPermission: '请在小程序设置中允许保存到相册',
    renameTitle: '重命名图片', deleteTitle: '删除图片？', deletePrompt: '“{name}”将被永久删除，不可恢复。',
    renameFailed: '重命名失败，请重试', deleteFailed: '删除失败，请重试'
  },
  sidebar: {
    pinned: '已置顶', recent: '最近', expand: '展开显示', rename: '重命名', renameChat: '重命名聊天', archiveChat: '归档聊天',
    empty: '暂无最近对话', noMatches: '未找到匹配会话',
    archivePrompt: '确定要归档此聊天吗？\n你可以在“设置”中查看已归档的聊天', deleteChat: '删除聊天？',
    deletePrompt: '删除后将无法恢复此对话。', listLoadFailed: '对话列表加载失败', pinFailed: '置顶失败', unpinFailed: '取消置顶失败',
    renameFailed: '重命名失败', deleteFailed: '删除失败', archiveFailed: '归档失败'
  },
  archive: {
    close: '关闭', loadEarlier: '加载更早的消息', noMessages: '暂无对话消息', messageLoadFailed: '对话消息加载失败',
    actionFailed: '操作失败，请重试',
    view: '查看', unarchive: '取消归档',
    title: '已归档的聊天', search: '搜索存档', loadFailed: '归档聊天加载失败', thisMonth: '本月', monthsAgo: '{count}个月前',
    lastYear: '去年', yearsAgo: '{count}年前', empty: '暂无已归档聊天', noMatches: '未找到匹配归档会话', archiveAll: '归档所有聊天', deleteAll: '删除所有聊天', archived: '聊天已归档',
    deleted: '聊天已删除', completed: '操作已执行'
  },
  tryIt: {
    title: '图片创作迎来重大升级', description: '更高质量的生成结果、更快的生成速度，以及更智能的创作工具', action: '试试看'
  },
  upgrade: {
    subscribed: '已订阅',
    title: '获取 YuanAI Pro', intro: '基础体验版的所有功能，以及：', continueFree: '继续使用基础体验版',
    unavailable: 'Pro 订阅暂未开放，你可以继续使用基础体验版。',
    benefits: [
      '更深入的思考与推理', 'Yuan Bot，专注任务执行', '联网搜索与来源追溯',
      '文件与图片理解', '更贴合你的个性化记忆', '抢先体验 YuanAI 新功能'
    ]
  },
  usageLimits: {
    freeUsage: '免费额度', freeLifetime: '一次性免费额度，用完不再补发',
    title: '使用情况和限制', agentUsage: '智能体使用限额', weeklyUsage: '本周期额度', cycleUsage: '本周期额度', usedPrefix: '已使用 ', usedSuffix: '%',
    packagePoints: '套餐剩余额度', purchasedPoints: '额外额度', pending: '处理中',
    nextGrant: '下次发放：{date}', notEnabled: '额度计费尚未启用', loadFailed: '额度暂时无法加载',
    amountLabel: '购买金额30元', pointsUnit: '额度', invalidAmount: '购买额度仅支持30元固定套餐',
    paymentPending: '支付结果核对中，到账后额度自动更新', paymentConfirmed: '额度已到账',
    proPrice: '¥36/月 · 每周期2500额度',
    resetAt: '于周二 08:33 重置', credits: '额度', remainingCredits: '剩余额度', remainingCreditsValue: '0 额度',
    creditsDescription: '额外额度可在套餐额度用尽后继续抵扣。', buyCredits: '购买额度',
    purchaseDescription: '额度自购买之日起12个月内有效', creditPack: '2000额度', creditPrice: '¥30.00', purchaseAction: '购买',
    purchaseUnavailable: '额度购买暂未开放，敬请期待。'
  },
  profile: {
    title: '个人资料', welcome: '欢迎您', name: '名字', nickname: '昵称', help: '你的个人资料可帮助他人在群聊中认出你。',
    save: '保存个人资料', takePhoto: '拍照', choosePhoto: '从相册选择', required: '请填写名字和昵称', saving: '保存中', saveFailed: '保存失败'
  },
  settings: {
    title: '设置',
    sections: { custom: '自定义{app}', account: '账户', app: '应用', suggestions: '建议', about: '关于' },
    language: { title: '应用语言', options: { zhCN: '中文', enUS: 'English' } },
    appearance: {
      title: '外观', system: '系统', systemDesc: '跟随系统外观', dark: '深色', darkDesc: '始终使用深色外观',
      light: '浅色', lightDesc: '始终使用浅色外观'
    },
    sound: '声音',
    voiceOptions: [
      { label: '知行', desc: '理性可靠' }, { label: '阿澈', desc: '清爽真诚' }, { label: '知夏', desc: '从容知性' },
      { label: '甜柚', desc: '亲切爱笑' }, { label: '景川', desc: '温柔会聊' }, { label: '晚棠', desc: '成熟撩人' },
      { label: '承安', desc: '稳重干练' }, { label: '闻笙', desc: '清晰专业' }, { label: '言川', desc: '温和克制' },
      { label: '小暖', desc: '贴心治愈' }, { label: '予白', desc: '安静耐心' }, { label: '小棠', desc: '元气温暖' },
      { label: '墨声', desc: '磁性陪伴' }, { label: '若岚', desc: '温柔细腻' }, { label: '阿晴', desc: '柔和亲近' }
    ],
    accentColor: '重点色',
    accentOptions: ['默认', '蓝色', '绿色', '黄色', '粉色', '橙色', '紫色', '黑色'],
    haptics: '触觉反馈', autocorrect: '自动更正拼写', dataControls: '数据控制',
    autocomplete: '自动完成', trending: '热门趋势搜索', followUps: '跟进建议', personalization: '个性化', memory: '记忆',
    phone: '电话号码', subscription: '订阅', upgrade: '升级', miniProgramVersion: '小程序版 {version}'
  },
  about: {
    report: '报告错误', help: '帮助中心', helpPending: '帮助中心内容将在后续版本接入。', terms: '使用条款',
    termsPending: '使用条款内容将在后续版本接入。', privacy: '隐私政策', privacyPending: '隐私政策内容将在后续版本接入。'
  },
  report: {
    whatHappened: '发生了什么?', placeholder: '请描述你遇到的问题',
    reviewNotice: '你提交的问题描述及设备、版本和页面信息将用于排查问题；不会自动附带聊天记录或屏幕截图。',
    promptTitle: '报告错误？', promptDescription: '如果遇到问题，可向我们反馈，以帮助改进 YuanAI。',
    failed: '上报未确认，请重试。为避免重复报告，重试将发送相同内容。',
    shake: '晃动手机报告错误', shakeOff: '关闭以禁用'
  },
  storage: {"title": "存储", "basic": "基础体验版", "pro": "Pro", "usedPrefix": "已用", "totalPrefix": "，共", "documents": "文档", "images": "图片", "loading": "正在加载存储用量…", "failed": "存储用量加载失败，点击重试", "overQuota": "已超过存储额度", "cleanupHint": "空间不足时，下次上传或生成内容将自动清理最早的文件（含生成作品）。头像不计入存储。"},
  dataControls: {
    startExport: '开始导出', exporting: '数据正在导出中，请耐心等待', exportFailed: '数据导出失败，请重新导出', deletingAccount: '账户正在删除中，请耐心等待', accountDeleted: '账户已删除',
    improveModel: '为所有用户改进模型',
    improveModelDesc: '允许我们将你的内容用于训练我们的模型，这样可以优化你和其他用户的 {app} 使用体验。我们将采取措施保护你的隐私。',
    voice: '声音', includeAudio: '包含录音', includeVideo: '包含录像',
    voiceDesc: '包含语音功能中的录音或录像以训练我们的模型。“为全体用户优化模型”部分涵盖了转录和其他文件。',
    location: '位置', locationServices: '位置服务',
    locationDesc: '启用后，你的位置信息将帮助 {app} 提供更相关的内容，例如本地推荐、新闻和天气。',
    allowLocation: '允许位置访问', locationEnabled: '已授权位置访问', locationPermission: '位置权限',
    locationPrompt: '请在小程序设置中开启位置权限', openSettings: '去设置', export: '导出数据', deleteAccount: '删除账户',
    archiveAllPrompt: '你所有的聊天都将归档。此操作无法撤销。', deleteAllPrompt: '你所有的聊天，以及保存的图片、文件和生成的图片都将被删除。此操作无法撤销。',
    exportPrompt: '即将要导出你的数据，可能需要一点时间，请耐心等待', deleteAccountPrompt: '确定要删除账户吗？此操作无法撤销。'
  },
  personalization: {
    baseStyle: '基本风格和语调', baseStyleDesc: '这是 {app} 在对话中使用的主要声音和语调，它不会影响 {app} 的功能。',
    traits: '特征', traitsDesc: '在基本风格和语调的基础上选择额外的自定义项。', customInstructions: '自定义指令',
    customInstructionsPlaceholder: '共享你希望 {app} 纳入其回复考虑范围...', memoryEnabled: '启用记忆',
    memoryDesc: '让 {app} 根据你的聊天记录、文件和已连接的插件个性化你的体验。', longTermMemory: '记忆摘要',
    longTermMemoryDesc: '{app} 会自动记住关于你的重要信息，并保持更新。你仍可查看和管理旧的已保存的记忆。',
    chatHistory: '参考历史聊天记录', chatHistoryDesc: '让 {app} 在回复时参考最近的对话。', nickname: '你的昵称',
    occupation: '你的职业', occupationPlaceholder: '工程师、学生等', details: '你的详情', detailsPlaceholder: '需要记住的兴趣、价值观或偏好',
    styles: {
      default: '默认', defaultDesc: '预设风格和语调', professional: '专业可靠', professionalDesc: '精雕细琢',
      friendly: '亲和友善', friendlyDesc: '温和健谈', candid: '直言不讳', candidDesc: '直率乐观', quirky: '天马行空',
      quirkyDesc: '趣味幻想', efficient: '高效务实', efficientDesc: '简练直白', cynical: '吐槽达人', cynicalDesc: '犀利毒舌型'
    },
    levels: {
      more: '增强', default: '默认', less: '减弱', gentleMore: '更友好、更亲近', gentleLess: '更专业，事实性更强',
      warmMore: '更热情、更主动', warmLess: '更冷静、更克制', headingsMore: '更多使用标题和列表',
      headingsLess: '更少使用标题和列表', emojiMore: '更多使用表情符号', emojiLess: '更少使用表情符号'
    },
    traitNames: { gentle: '温和体贴', warm: '热情洋溢', headings: '标题和列表', emoji: '表情符号' }
  },
  memory: {
    title: '记忆摘要', generating: '生成中', updatedNow: '刚刚更新', item: '记忆 {index}', empty: '目前没有保存的记忆。',
    unavailable: '暂时无法加载', tryLater: '请稍后重试。', moreActions: '记忆摘要操作', about: '关于记忆', refresh: '刷新摘要',
    deleteAndDisable: '删除并关闭记忆', deleteConfirmTitle: '删除并关闭记忆？',
    deleteConfirmMessage: 'YuanAI 将不再记住关于你的重要信息，因此你的体验将不再那么个性化。',
    aboutDescription: 'YuanAI 会自动记住关于你的重要信息，并保持更新。此摘要页面仅简要概述已记住的内容，并非完整列表。',
    gotIt: '知道了', deleted: '记忆已删除', deleteFailed: '删除记忆失败',
  },
  notification: {
    title: '通知', locations: '你收到通知的位置',
    categories: { reply: '回复', group: '群聊', task: '任务', recommend: '推荐', usage: '使用情况' },
    channels: { wechat: '微信通知', sms: '手机短信', separator: '和', combined: '{channels}', off: '关闭' },
    hints: {
      reply: '当有人回复你时，你会收到通知。', group: '当群聊中有新消息时，你会收到通知。', task: '当你创建的任务有更新时收到通知。',
      recommend: '当有新的推荐内容时，你会收到通知。', usage: '当你的使用情况有更新时，你会收到通知。'
    }
  },
  reasoning: {
    stopping: '停止中',
    title: '处理过程', processing: '正在处理', thinking: '正在思考', processed: '已处理', processedFor: '已处理 {duration}', stoppedPrefix: '你在', stoppedSuffix: ' 后停止了',
    durationUnits: { second: '秒', minute: '分', hour: '时', day: '天' },
    efforts: { light: '轻度', medium: '中', high: '高', 'very-high': '极高', 'ultra-high': '超高' }
  },
  sources: {
    empty: '暂无来源',
    title: '来源', count: '{count}个来源', viewCount: '查看{count}个来源', hint: '知识库来源可查看证据及原文，网页来源可复制链接',
    openEvidence:'查看知识库证据：{title}', openOriginal:'打开原文', close:'关闭', oldVersion:'历史版本证据', lines:'行',
    copyLink: '复制来源链接：{title}', copied: '链接已复制，可在浏览器查看'
  },
  renderer: { copySuccess: '代码已复制', copyFailed: '复制失败，请重试', imageFailed: '图片加载失败', imageGenerationFailed: '图片未能生成，请重试', chartFailed: '图表加载失败', formulaFailed: '公式加载失败' },
  validation: { nameRequired: '名称不能为空' }
}
