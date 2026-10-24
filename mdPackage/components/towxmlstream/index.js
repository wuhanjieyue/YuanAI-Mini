const md = require('./parse/markdown/index'),
    parse = require('./parse/index')
const { normalizeCitations } = require('../../../static_utils/chatSources')
const { deliveredAttachment } = require('../../../static_utils/chatArtifacts')

function render(str, type, option, streamMode) {
    option = Object.assign({ skyline: true }, option || {});
    option.streaming = streamMode && option.streaming !== false;
    let result;
    switch (type) {
        case 'markdown':
            let r = md(str, {
                citationUrls: new Map(normalizeCitations(option.citations).map(item => [item.reference_id, item.url])),
                images: option.images?.filter(item => item?.artifactType === 'image'),
                files: [...(option.images || []), ...(option.files || [])].map(deliveredAttachment)
                    .filter(item => item?.attachmentType === 'file'),
                streaming: option.streaming
            })
            if (streamMode) {
                // 流式渲染保留换行节点，避免增量解析时节点边界漂移
                r = r.replace(/(\r|\n){1,}/g, str => {
                    return new Array(str.length).join("<p>&nbsp;</p>")
                });
                r = r.replace(/\r|\n/g, str => {
                    return "\r"
                });
            }

            result = parse(r, option);
            break;
        case 'html':
            result = parse(str, option);
            break;
        default:
            throw new Error('Invalid type, only markdown and html are supported');
            break;
    };
    return result;
}

const streamTowxml = (str, type, option) => render(str, type, option, true)

// 完成态沿用普通 towxml 的一次性解析行为，但共用同一套解析源码。
streamTowxml.static = (str, type, option) => render(str, type, option, false)

module.exports = streamTowxml
