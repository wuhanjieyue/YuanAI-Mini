// Local UI demonstration only; these entries are never sent to the chat API.
module.exports = [
  { id: 'projects', label: '项目空间', children: [
    { id: 'yuanai', label: 'YuanAI 产品', children: [
      { id: 'mini', label: '小程序', children: [
        { id: 'chat-ui', label: '聊天交互', children: [
          { id: 'messages', label: '消息展示', children: [
            { id: 'conversation', label: '会话场景', children: [
              { id: 'work-mode', label: '工作模式', children: [
                { id: 'directory-picker', label: '目录选择', children: [
                  { id: 'cascade-validation', label: '级联验收', children: [
                    { id: 'depth-ten', label: '十级路径验收' },
                    { id: 'scroll-validation', label: '长列表滚动验收' },
                    { id: 'device-validation', label: '真机验收（待开放）', disabled: true }
                  ] },
                  { id: 'directory-copy', label: '目录提示文案' }
                ] },
                { id: 'welcome-copy', label: '欢迎消息' },
                { id: 'work-empty', label: '空目录', children: [] }
              ] },
              { id: 'temporary-chat', label: '临时会话' }
            ] },
            { id: 'message-spacing', label: '消息间距' }
          ] },
          { id: 'composer', label: '输入框' }
        ] },
        { id: 'account', label: '账号与权限' },
        { id: 'release', label: '版本发布' },
        { id: 'accessibility', label: '无障碍检查' },
        { id: 'archive', label: '历史方案（只读）', disabled: true },
        { id: 'mini-6', label: '消息搜索' },
        { id: 'mini-7', label: '语音输入' },
        { id: 'mini-8', label: '文件预览' },
        { id: 'mini-9', label: '图片编辑' },
        { id: 'mini-10', label: '主题外观' },
        { id: 'mini-11', label: '通知设置' },
        { id: 'mini-12', label: '多语言' },
        { id: 'mini-13', label: '离线草稿' },
        { id: 'mini-14', label: '分享链接' },
        { id: 'mini-15', label: '用量统计' },
        { id: 'mini-16', label: '反馈中心' },
        { id: 'mini-17', label: '隐私设置' },
        { id: 'mini-18', label: '性能优化' },
        { id: 'mini-19', label: '自动化测试' },
        { id: 'mini-20', label: '发布验收' }
      ] },
      { id: 'roadmap', label: '产品路线图' },
      { id: 'api', label: '服务端', children: [
        { id: 'agent', label: 'Agent 运行时' }, { id: 'storage', label: '文件与存储' }
      ] }
    ] },
    { id: 'website', label: '官网更新' },
    { id: 'research', label: '研究实验', children: [
      { id: 'benchmark', label: '模型评测' }, { id: 'prompt', label: '提示词实验' }
    ] }
  ] },
  { id: 'inbox', label: '临时收件箱' },
  { id: 'team', label: '团队协作', children: [
    { id: 'design', label: '设计资源', children: [
      { id: 'brand', label: '品牌规范' },
      { id: 'assets', label: '素材库', children: [
        { id: 'icons', label: '图标' }, { id: 'illustrations', label: '插画' }
      ] }
    ] },
    { id: 'minutes', label: '会议纪要' }
  ] },
  { id: 'personal', label: '个人笔记' },
  { id: 'reading', label: '阅读清单', children: [
    { id: 'pending', label: '待阅读' }, { id: 'finished', label: '已整理', children: [] }
  ] },
  { id: 'templates', label: '模板目录（暂不可用）', disabled: true }
]
