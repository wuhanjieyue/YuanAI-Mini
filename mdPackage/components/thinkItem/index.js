const { currentProcessNode, localizeProcessNode, processPresentation } = require('../../../static_utils/processTrace')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')
// mdPackage/components/thinkItem/index.js
Component({
  behaviors: [i18nBehavior],

  /**
   * 组件的属性列表
   */
  properties: {
    thinkStatus:{
      type:Number,
      value:0
    },
    responseStarted:{ type:Boolean, value:false },
    thinkingStarted:{ type:Boolean, value:false },
    processingOnly:{type:Boolean,value:false},
    timelineNode:{type:Boolean,value:false},
    nodeEnded:{type:Boolean,value:false},
    completedTools:{type:Array,value:[]},
    stopped:{ type:Boolean, value:false },
    turnStatus:{type:String,value:''},
    turnKey:{type:String,value:''},
    thinkOpen:{
      type:Boolean,
      value:false
    },
    thinkText:{
      type:String,
      value:""
    },
    thinkDurationText:{
      type:String,
      value:""
    },
    processTrace:{
      type:Array,
      value:[]
    },
    fullProcessTrace:{type:Array,value:[]},
    processDurationMs:{
      type:Number,
      value:0
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    activityIcon:'',
    nodeRunning:false,
    toolsCompleted:false,
    activityTitle:'正在处理'
  },

  observers: {
    'processTrace, language, responseStarted, thinkingStarted, completedTools, timelineNode, processingOnly, nodeEnded':function(trace, language, responseStarted, thinkingStarted, completedTools = this.data?.completedTools){
      const {processingOnly, timelineNode, nodeEnded} = this.data || {}
      const current = localizeProcessNode(currentProcessNode(trace), language, timelineNode && nodeEnded)
      const presentation = processPresentation(current, language)
      const groupTitle = presentation?.groupTitle || (Array.isArray(completedTools)
        ? completedTools.map(tool => processPresentation(tool, language)?.groupTitle).find(Boolean) : '') || ''
      const completedTitle = timelineNode && !processingOnly && nodeEnded ? groupTitle : ''
      const active = !processingOnly && current && (timelineNode || ['proposed','ready','running'].includes(current.status)) ? current : null
      this.setData({
        nodeRunning:Boolean(!nodeEnded && !completedTitle && current && ['proposed','ready','running'].includes(current.status)),
        toolsCompleted:Boolean(completedTitle),
        activityIcon:processingOnly ? '' : active?.activityIcon || (thinkingStarted ? 'icon-thinking' : ''),
        activityTitle:completedTitle || (!processingOnly && presentation ? current.title : t(language || '中文', !processingOnly && thinkingStarted ? 'reasoning.thinking' : 'reasoning.processing'))
      })
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    openReasoning(){
      if(this.data.processingOnly) return
      const trace = this.data.fullProcessTrace?.length ? this.data.fullProcessTrace : this.data.processTrace
      const hasTrace = Array.isArray(trace) && trace.length > 0
      if(![1,2].includes(this.data.thinkStatus) || !hasTrace) return
      this.triggerEvent('open', {
        durationText:this.data.thinkDurationText || '',
        processTrace:trace,
        processDurationMs:this.data.processDurationMs,
        status:this.data.turnStatus,
        turnKey:this.data.turnKey,
        stopped:this.data.stopped
      }, {})
    }
  }
})
