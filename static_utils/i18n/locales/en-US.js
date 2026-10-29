module.exports = {
  common: {
    confirm: 'Confirm', cancel: 'Cancel', save: 'Save', send: 'Send', delete: 'Delete', edit: 'Edit', copy: 'Copy', copied: 'Copied', done: 'Done',
    retry: 'Try again', loading: 'Loading', loadFailed: 'Couldn’t load', requestFailed: 'Request failed', operationFailed: 'Couldn’t complete. Try again.',
    saved: 'Saved', sent: 'Sent', on: 'On', off: 'Off', enabled: 'Allowed', search: 'Search', file: 'File', image: 'Image',
    document: 'Document', camera: 'Camera', photo: 'Photo', plugin: 'Plugins', default: 'Default', system: 'System', overview: 'Overview',
    justNow: 'Just now', learnMore: 'Learn more', comingSoon: 'Coming soon'
  },
  auth: {
    login: 'Log in', loggingIn: 'Logging in', loggedIn: 'Logged in', loginFailed: 'Login failed', logout: 'Log out', loggingOut: 'Logging out',
    loggedOut: 'Logged out', logoutFailed: 'Logout failed', phoneAuthIncomplete: 'Phone access not granted', loginRequired: 'Log in to continue',
    upgradeRequired: 'Upgrade to {plan}'
  },
  home: { chat: 'Chat', library: 'Library', tasks: 'Tasks', knowledge: 'Knowledge', create: 'Create' },
  chat: {
    askBot: 'Ask Yuan Bot', connections: 'Connections',
    disclaimer: 'Yuan is AI and can make mistakes. Verify important info.',
    askAnything: 'Ask anything', newChat: 'New chat', temporary: 'Temporary chat', temporaryShort: 'Temporary', work: 'Yuan Bot',
    temporaryNotice: 'Memory is off for this chat. It won’t appear in history.',
    temporaryPrivacy: 'This chat won’t train our models. A copy may be kept for 30 days for safety.',
    ready: 'How can I help?', workReady: 'Your personal cloud assistant bot', inDevelopment: 'This feature is under development', share: 'Share', pin: 'Pin', unpin: 'Unpin', archive: 'Archive', smart: 'Deep Thinking',
    temporaryActionUnavailable: 'Temporary chats cannot be pinned or archived',
    transcription: 'Transcribing', voiceHint: 'Swipe up to dictate', microphoneTitle: 'Microphone access',
    microphoneMessage: 'Allow microphone access in Mini Program settings?', responding: 'This chat is responding', stopping: 'Stopping', stopped: 'Stopped',
    regenerate: 'Regenerate', retry: 'Retry', branch: 'Branch to new chat', readAloud: 'Read aloud',
    usedModel: 'Used {model}', defaultModel: 'Default model', searchWeb: 'Search the web', deepResearch: 'Deep research', moreActions: 'Long-term memory actions',
    offline: 'Offline. Sync resumes when connected',
    reconnecting: 'Reconnecting', waitingToSend: 'Waiting to send',
    generating: 'Generating',
    sessionLoadFailed: 'Couldn’t load chat', historyLoadFailed: 'Couldn’t load earlier messages', modelLoadFailed: 'Couldn’t load models. Try again.',
    fallback: 'Something went wrong. Please try again.', feedbackLocalUnsupported: 'Feedback isn’t available for local messages',
    quotaInsufficient: 'Not enough credits. Add more to keep going.',
    quotaReservedBusy: 'Your credits are still being processed. Try again shortly.',
    feedbackUnavailable: 'Feedback isn’t ready', feedbackFailed: 'Couldn’t save feedback', copyMessage: 'Copy', editMessage: 'Edit',
    feedback: 'Rate response', like: 'Like', dislike: 'Dislike'
  },
  speech: {
    loading:'Preparing…', play:'Resume reading', pause:'Pause reading', rate:'Playback speed',
    rewind:'Back 15 seconds', forward:'Forward 15 seconds', close:'Stop reading and close',
    failed:'Couldn’t read aloud. Try again.', tooLong:'This reply is too long to read aloud.', busy:'Read aloud is busy. Try again shortly.'
  },
  dictation: {
    failed:'Couldn’t transcribe. Try again.', empty:'No speech detected. Try again.',
    busy:'Transcription is busy. Try again shortly.', recordFailed:'Couldn’t record. Check microphone access.', interrupted:'Recording was interrupted.'
  },
  attachments: {
    uploadFailed: 'Upload failed', attachmentUploadFailed: 'Attachment upload failed', deleteFailed: 'Couldn’t delete file',
    pending: 'Attachments are still uploading', uploading: 'Uploading attachments', limit: 'Up to 9 attachments per message',
    guestTooLarge: 'Up to 5 MB per upload while signed out',
    tooLarge: 'Each attachment must be no larger than {limit} MB',
    unsupportedFormat: 'Unsupported attachment format. Choose a text/code file, Office, PDF, or a common image'
  },
  tools: {
    image: 'Create image', imageDesc: 'Visualize anything', research: 'Deep research', researchDesc: 'Get a detailed report',
    webSearch: 'Web search', webSearchDesc: 'Find current information', study: 'Study', studyDesc: 'Learn something new',
    agent: 'Agent mode', agentDesc: 'Get work done', addFile: 'Add files', addFileDesc: 'Analyze or summarize', enableKnowledge: 'Use knowledge base'
  },
  plugins: {
    skills: 'Skills', tools: 'Tools', plugins: 'Plugins', skillsSearch: 'Search skills', toolsSearch: 'Search tools',
    skillsEmpty: 'No skills available', toolsEmpty: 'No tools available', pluginsEmpty: 'No plugins available',
    mcpFilter: 'MCP type', mcpAll: 'All', mcpDeveloper: 'Developer tools', mcpSearch: 'Search tools',
    mcpData: 'Data lookup', mcpContent: 'Content creation', mcpBusiness: 'Business services', mcpLife: 'Lifestyle',
    skillFilter: 'Skill category', skillGeneral: 'General tools', skillDevelopment: 'Development & operations', skillFinance: 'Finance',
    skillBusiness: 'Business', skillContent: 'Content creation', skillLife: 'Lifestyle', skillEducation: 'Research & education',
    skillOffice: 'Productivity', skillLegal: 'Legal & compliance', skillHealth: 'Health', skillData: 'Data analysis',
    tryMcp: 'Try this tool', mcpUnavailable: 'Tool trials are not available yet',
    updatedAt: 'Data updated at', trySkill: 'Try this skill', tryUnavailable: 'Skill trials are not available yet',
    installed: 'Installed', recommended: 'Recommended', search: 'Search plugins', clearSearch: 'Clear search',
    empty: 'No skills available', more: 'More actions', install: 'Enable', preview: 'Preview'
  },
  library: {
    grid: 'Grid', list: 'List', filter: 'Filter', uploaded: 'User uploads', generated: 'System generated',
    favorites: 'Favorites',
    title: 'Library', search: 'Search library', all: 'All', images: 'Images', documents: 'Documents', myFiles: 'My files',
    inspiration: 'Inspiration', notes: 'Project notes', resume: 'CV & profile', reading: 'Reading list', photos: 'Saved images'
  },
  knowledge: {
    added: 'Added to knowledge', addFailed: 'Couldn’t add to knowledge. Please try again.',
    statusFailed: 'Couldn’t check knowledge status. Please reopen the menu.',
    viewOriginal: 'View original', chunks: 'Chunks', chunk: 'Chunk', chunkNumber: 'Chunk {number}', open: 'Open',
    noChunks: 'No chunks available', unavailable: 'This document is unavailable',
    search: 'Search knowledge', clearSearch: 'Clear search', add: 'Add to knowledge', note: 'Note', uploadFile: 'Upload file',
    chooseFailed: 'Could not select files. Try again.', empty: 'Tap + to add a file or image', remove: 'Remove from knowledge', deletePrompt: 'Remove “{name}” from knowledge? The original stays in your files.'
  },
  create: {
    clearSearch: 'Clear search',
    search: 'Search creations', noMatches: 'No matching creations',
    noPrompt: 'No prompt available for this image', shareFailed: 'Could not share. Try again.', tryPrompt: 'Try this prompt', takePhoto: 'Take photo', choosePhoto: 'Choose a photo',
    templates: 'Templates', popular: 'Popular', mine: 'My creations',
    empty: 'Images you create in chats will appear here',
    samples: { poster: 'Poster', interior: 'Interior design', logo: 'Logo', illustration: 'Illustration', portrait: 'Portrait', icons: 'Icons' }
  },
  assets: {
    addFavorite: 'Add to favorites', removeFavorite: 'Remove from favorites',
    favoriteAdded: 'Added to favorites', favoriteRemoved: 'Removed from favorites',
    favoriteAddFailed: 'Couldn’t add to favorites. Please try again.', favoriteRemoveFailed: 'Couldn’t remove from favorites. Please try again.',
    getMoreStorage: 'Get more storage',
    spaceInsufficient: 'No storage space', fileDeleted: 'File deleted', imageDeleted: 'This image has been deleted', deleted: 'Deleted', renameFileTitle: 'Rename file', deleteFileTitle: 'Delete file?',
    empty: 'Images and files you upload in chats will appear here', noMatches: 'No matching files',
    imageUnavailable: 'Image unavailable. Tap to refresh', generatedImage: 'Generated image',
    previewUnsupported: 'This file type cannot be previewed', previewFailed: 'Could not preview file. Try again.',
    downloadFailed: 'Could not download file. Try again.',
    preparingFile: 'Preparing file…',
    uploadedAt: 'Uploaded', end: 'All items loaded', unavailable: 'Not available yet',
    savePhoto: 'Save to Photos', saveFile: 'Save to Files', chat: 'Chat about this', rename: 'Rename', move: 'Move',
    deleteLibrary: 'Remove from library', deleteCreation: 'Delete creation',
    photoSaved: 'Image saved', photoSaveFailed: 'Couldn’t save image. Please try again.', photoPermission: 'Allow saving to Photos in Mini Program settings',
    renameTitle: 'Rename image', deleteTitle: 'Delete image?', deletePrompt: '“{name}” will be permanently deleted and cannot be recovered.',
    renameFailed: 'Couldn’t rename image. Please try again.', deleteFailed: 'Couldn’t delete image. Please try again.'
  },
  sidebar: {
    pinned: 'Pinned', recent: 'Recent', expand: 'Show more', rename: 'Rename', renameChat: 'Rename chat', archiveChat: 'Archive chat',
    empty: 'No recent chats', noMatches: 'No chats found',
    archivePrompt: 'Archive this chat?\nFind it later in Settings.', deleteChat: 'Delete chat?', deletePrompt: 'This chat can’t be recovered.',
    listLoadFailed: 'Couldn’t load chats', pinFailed: 'Couldn’t pin chat', unpinFailed: 'Couldn’t unpin chat',
    renameFailed: 'Couldn’t rename chat', deleteFailed: 'Couldn’t delete chat', archiveFailed: 'Couldn’t archive chat'
  },
  archive: {
    close: 'Close', loadEarlier: 'Load earlier messages', noMessages: 'No messages yet', messageLoadFailed: 'Couldn’t load messages',
    actionFailed: 'Action failed. Try again.',
    view: 'View', unarchive: 'Unarchive',
    title: 'Archived chats', search: 'Search archive', loadFailed: 'Couldn’t load archived chats', thisMonth: 'This month', monthsAgo: '{count} months ago',
    lastYear: 'Last year', yearsAgo: '{count} years ago', empty: 'No archived chats', noMatches: 'No archived chats found', archiveAll: 'Archive all chats', deleteAll: 'Delete all chats', archived: 'Chats archived',
    deleted: 'Chats deleted', completed: 'Done'
  },
  tryIt: {
    title: 'Image creation got a major upgrade', description: 'Higher-quality results, faster generation, and smarter creative tools', action: 'Try it'
  },
  upgrade: {
    subscribed: 'Subscribed',
    title: 'Get YuanAI Pro', intro: 'Everything in Basic, and:', continueFree: 'Continue with Basic',
    unavailable: 'Pro subscriptions are not available yet. You can continue using Basic.',
    benefits: [
      'Deeper thinking and reasoning', 'Yuan Bot for focused tasks', 'Web search with traceable sources',
      'Understand files and images', 'Personalized memory that fits you', 'Early access to new YuanAI features'
    ]
  },
  usageLimits: {
    freeUsage: 'Free allowance', freeLifetime: 'One-time free allowance; no replenishment',
    title: 'Usage and limits', agentUsage: 'Agent usage limits', weeklyUsage: 'Current cycle allowance', cycleUsage: 'Current cycle allowance', usedPrefix: '', usedSuffix: '% used',
    packagePoints: 'Remaining plan credits', purchasedPoints: 'Additional credits', pending: 'Processing',
    nextGrant: 'Next grant: {date}', notEnabled: 'Quota billing is not enabled yet', loadFailed: 'Unable to load allowance',
    amountLabel: 'Purchase price: 30 yuan', pointsUnit: 'credits', invalidAmount: 'Only the fixed ¥30 credit pack is available',
    paymentPending: 'Payment verification pending; allowance updates after confirmation', paymentConfirmed: 'Allowance received',
    proPrice: '¥36/month · 2500 credits per cycle',
    resetAt: 'Resets Tuesday at 8:33 AM', credits: 'Credits', remainingCredits: 'Remaining credits', remainingCreditsValue: '0 credits',
    creditsDescription: 'Additional credits cover usage after your plan allowance runs out.', buyCredits: 'Buy credits',
    purchaseDescription: 'Credits are valid for 12 months from the purchase date', creditPack: '2000 credits', creditPrice: '¥30.00', purchaseAction: 'Buy',
    purchaseUnavailable: 'Credit purchases are not available yet.'
  },
  profile: {
    title: 'Profile', welcome: 'Welcome', name: 'Name', nickname: 'Nickname', help: 'Your profile helps people recognize you in group chats.',
    save: 'Save profile', takePhoto: 'Take photo', choosePhoto: 'Choose photo', required: 'Enter a name and nickname', saving: 'Saving', saveFailed: 'Couldn’t save'
  },
  settings: {
    title: 'Settings',
    sections: { custom: 'Customize {app}', account: 'Account', app: 'App', suggestions: 'Suggestions', about: 'About' },
    language: { title: 'App language', options: { zhCN: 'Chinese', enUS: 'English' } },
    appearance: {
      title: 'Appearance', system: 'System', systemDesc: 'Match device', dark: 'Dark', darkDesc: 'Always dark',
      light: 'Light', lightDesc: 'Always light'
    },
    sound: 'Voice',
    voiceOptions: [
      { label: 'Zhixing', desc: 'Calm & reliable' }, { label: 'A-Che', desc: 'Fresh & sincere' }, { label: 'Zhixia', desc: 'Calm & wise' },
      { label: 'Tianyou', desc: 'Bright & friendly' }, { label: 'Jingchuan', desc: 'Gentle & chatty' }, { label: 'Wantang', desc: 'Mature & charming' },
      { label: 'Cheng’an', desc: 'Steady & sharp' }, { label: 'Wensheng', desc: 'Clear & professional' }, { label: 'Yanchuan', desc: 'Gentle & reserved' },
      { label: 'Xiaonuan', desc: 'Warm & caring' }, { label: 'Yubai', desc: 'Quiet & patient' }, { label: 'Xiaotang', desc: 'Bright & warm' },
      { label: 'Mosheng', desc: 'Rich & soothing' }, { label: 'Ruolan', desc: 'Soft & refined' }, { label: 'A-Qing', desc: 'Soft & friendly' }
    ],
    accentColor: 'Accent color',
    accentOptions: ['Default', 'Blue', 'Green', 'Yellow', 'Pink', 'Orange', 'Purple', 'Black'],
    haptics: 'Haptics', autocorrect: 'Autocorrect', dataControls: 'Data controls',
    autocomplete: 'Autocomplete', trending: 'Trending searches', followUps: 'Follow-up ideas', personalization: 'Personalization', memory: 'Memory',
    phone: 'Phone number', subscription: 'Subscription', upgrade: 'Upgrade', miniProgramVersion: 'Mini Program {version}'
  },
  about: {
    report: 'Report a problem', help: 'Help center', helpPending: 'Help center is coming soon.', terms: 'Terms',
    termsPending: 'Terms are coming soon.', privacy: 'Privacy policy', privacyPending: 'Privacy policy is coming soon.'
  },
  report: {
    whatHappened: 'What happened?', placeholder: 'Describe the problem',
    reviewNotice: 'Your description, device, version and page information will help us investigate. Chat history and screenshots are not attached automatically.',
    promptTitle: 'Report a problem?', promptDescription: 'If something went wrong, send us a report to help improve YuanAI.',
    failed: 'Submission was not confirmed. Retry sends the same report to avoid duplicates.',
    shake: 'Shake to report', shakeOff: 'Turn off to disable'
  },
  storage: {"title": "Storage", "basic": "Basic", "pro": "Pro", "usedPrefix": "Used", "totalPrefix": " of", "documents": "Documents", "images": "Images", "loading": "Loading storage usage…", "failed": "Unable to load storage. Tap to retry.", "overQuota": "Storage quota exceeded", "cleanupHint": "When space is insufficient, your next upload or generation automatically removes the oldest files, including creations. Avatars do not count."},
  dataControls: {
    startExport: 'Start export', exporting: 'Your data is being exported. Please wait.', exportFailed: 'Export failed. Please try again.', deletingAccount: 'Your account is being deleted. Please wait.', accountDeleted: 'Account deleted',
    improveModel: 'Improve models for everyone',
    improveModelDesc: 'Allow your content to train our models and improve {app}. We take steps to protect your privacy.',
    voice: 'Voice', includeAudio: 'Include audio', includeVideo: 'Include video',
    voiceDesc: 'Include voice recordings or videos in model training. Transcripts and files follow the main model-training setting.',
    location: 'Location', locationServices: 'Location services', locationDesc: 'Let {app} use your location for local recommendations, news, and weather.',
    allowLocation: 'Allow location', locationEnabled: 'Location allowed', locationPermission: 'Location access',
    locationPrompt: 'Turn on location in Mini Program settings', openSettings: 'Open settings', export: 'Export data', deleteAccount: 'Delete account',
    archiveAllPrompt: 'Archive all chats? This can’t be undone.', deleteAllPrompt: 'Delete all chats, saved images and files, and generated images? This can’t be undone.',
    exportPrompt: 'Your data is about to be exported. This may take a little time. Please wait.', deleteAccountPrompt: 'Delete your account? This can’t be undone.'
  },
  personalization: {
    baseStyle: 'Base style and tone', baseStyleDesc: 'The main voice and tone {app} uses in chats. It doesn’t change features.',
    traits: 'Traits', traitsDesc: 'Add traits to the base style and tone.', customInstructions: 'Custom instructions',
    customInstructionsPlaceholder: 'Share what {app} should consider in replies...', memoryEnabled: 'Use memory',
    memoryDesc: 'Let {app} personalize replies using chats, files, and connected plugins.', longTermMemory: 'Memory summary',
    longTermMemoryDesc: '{app} remembers useful details and keeps them updated. You can review saved memories anytime.',
    chatHistory: 'Use chat history', chatHistoryDesc: 'Let {app} refer to recent chats.', nickname: 'Your nickname',
    occupation: 'Your role', occupationPlaceholder: 'Engineer, student, etc.', details: 'About you', detailsPlaceholder: 'Interests, values, or preferences to remember',
    styles: {
      default: 'Default', defaultDesc: 'Preset style and tone', professional: 'Professional', professionalDesc: 'Polished and precise',
      friendly: 'Friendly', friendlyDesc: 'Warm and chatty', candid: 'Candid', candidDesc: 'Direct and upbeat', quirky: 'Quirky',
      quirkyDesc: 'Playful and imaginative', efficient: 'Efficient', efficientDesc: 'Concise and direct', cynical: 'Cynical', cynicalDesc: 'Sharp and sarcastic'
    },
    levels: {
      more: 'More', default: 'Default', less: 'Less', gentleMore: 'Friendlier and warmer', gentleLess: 'More professional and factual',
      warmMore: 'More enthusiastic and proactive', warmLess: 'Calmer and more reserved', headingsMore: 'Use more headings and lists',
      headingsLess: 'Use fewer headings and lists', emojiMore: 'Use more emoji', emojiLess: 'Use fewer emoji'
    },
    traitNames: { gentle: 'Warm', warm: 'Enthusiastic', headings: 'Headings & lists', emoji: 'Emoji' }
  },
  memory: {
    title: 'Memory summary', generating: 'Generating', updatedNow: 'Updated now', item: 'Memory {index}', empty: 'No saved memories yet.',
    unavailable: 'Can’t load memories', tryLater: 'Try again later.', moreActions: 'Memory summary actions', about: 'About memory', refresh: 'Refresh summary',
    deleteAndDisable: 'Delete and turn off memory', deleteConfirmTitle: 'Delete and turn off memory?',
    deleteConfirmMessage: 'YuanAI will stop remembering important information about you, so your experience will be less personalized.',
    aboutDescription: 'YuanAI automatically remembers important information about you and keeps it updated. This summary is only a brief overview, not a complete list.',
    gotIt: 'Got it', deleted: 'Memories deleted', deleteFailed: 'Couldn’t delete memories',
  },
  notification: {
    title: 'Notifications', locations: 'Where notified',
    categories: { reply: 'Replies', group: 'Groups', task: 'Tasks', recommend: 'Suggestions', usage: 'Usage' },
    channels: { wechat: 'WeChat', sms: 'SMS', separator: ' & ', combined: '{channels}', off: 'Off' },
    hints: {
      reply: 'When someone replies.', group: 'For new group messages.', task: 'When your task changes.',
      recommend: 'When new suggestions arrive.', usage: 'When your usage changes.'
    }
  },
  reasoning: {
    stopping: 'Stopping',
    title: 'Process', processing: 'Processing', thinking: 'Thinking', processed: 'Processed', processedFor: 'Processed {duration}', stoppedPrefix: 'Stopped after', stoppedSuffix: '',
    durationUnits: { second: 'S', minute: 'M', hour: 'H', day: 'D' },
    efforts: { light: 'Light', medium: 'Medium', high: 'High', 'very-high': 'Very high', 'ultra-high': 'Max' }
  },
  sources: {
    empty: 'No sources yet',
    title: 'Sources', count: '{count} sources', viewCount: 'View {count} sources', hint: 'Tap knowledge sources for evidence and originals; web sources copy a link',
    openEvidence:'Open knowledge evidence: {title}', openOriginal:'Open original', close:'Close', oldVersion:'Historical evidence', lines:'Lines',
    copyLink: 'Copy link: {title}', copied: 'Link copied'
  },
  renderer: { copySuccess: 'Code copied', copyFailed: 'Couldn’t copy. Try again.', imageFailed: 'Image failed to load', imageGenerationFailed: 'Couldn’t create image. Try again.', chartFailed: 'Chart failed to load', formulaFailed: 'Formula failed to load' },
  validation: { nameRequired: 'Name is required' }
}
