let hljs;
hljs = require('../highlight/index');

function replaceSpacesInText(html) {
    let result = '';
    let index = 0;
    const htmlLength = html.length;

    while (index < htmlLength) {
        // 检查是否为注释
        if (html.slice(index, index + 4) === '<!--') {
            const commentEnd = html.indexOf('-->', index);
            if (commentEnd!== -1) {
                result += html.slice(index, commentEnd + 3);
                index = commentEnd + 3;
                continue;
            }
        }

        // 检查是否为标签
        if (html[index] === '<') {
            const tagEnd = html.indexOf('>', index);
            if (tagEnd!== -1) {
                const tag = html.slice(index, tagEnd + 1);
                result += tag;
                index = tagEnd + 1;

                // 特殊标签处理
                if (/^<(script|style)/i.test(tag)) {
                    const endTag = `</${tag.match(/^<(\w+)/i)[1]}>`;
                    const endTagIndex = html.indexOf(endTag, index);
                    if (endTagIndex!== -1) {
                        result += html.slice(index, endTagIndex + endTag.length);
                        index = endTagIndex + endTag.length;
                    }
                }
            }
        } else {
            // 处理标签内文本
            const nextTagStart = html.indexOf('<', index);
            let text = nextTagStart!== -1? html.slice(index, nextTagStart) : html.slice(index);
            text = text.replace(/\s/g, '&nbsp;');
            text = text.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
            result += text;
            index = nextTagStart!== -1? nextTagStart : htmlLength;
        }
    }

    return result;
}

const config = require('../../config'),
    mdOption = (() => {
        let result = {
            html: true,
            xhtmlOut: true,
            typographer: true,
            breaks: true,
        };

        if (config.highlight.length && hljs) {
            result.highlight = (code, lang, callback) => {
                let lineLen = code.split(/\r\n|\r|\n/g).length,
                    language = (lang || '').split(/\s+/)[0],
                    result = language && hljs.getLanguage(language)
                        ? hljs.highlight(language, code, true).value
                        : hljs.highlightAuto(code).value;

                result = result.replace(/\r\n|\r|\n/g, "<br/>");

                // 代码空格处理
                // result = result.replace(/>[^<]+</g, str => {
                //     return str.replace(/\s/g, "&nbsp;");
                // }).replace(/\t/g, new Array(4).join("&nbsp;"));

                
                result = replaceSpacesInText(result)
                // console.log('result的值', result)
                if (config.showLineNumber) {
                    let lineStr = (() => {
                        let str = `<ul class="h2w__lineNum">`;
                        for (let i = 0; i < lineLen - 1; i++) {
                            str += `<li class="h2w__lineNumLine">${i + 1}</li>`
                        };

                        str += `</ul>`;
                        return str;
                    })();
                    return lineStr + result;
                };
                return result;
            }
        };
        return result;
    })(),
    md = require('./markdown')(mdOption);

// 高亮会替换空白，复制使用 Markdown token 中的原始代码。
for (const rule of ['fence', 'code_block']) {
    const render = md.renderer.rules[rule];
    md.renderer.rules[rule] = (tokens, index, options, env, self) => {
        const source = md.utils.escapeHtml(JSON.stringify(tokens[index].content));
        return render(tokens, index, options, env, self).replace('<pre', `<pre data-code-content="${source}"`);
    };
}

// 应用Markdown解析扩展，包括自定义组件（['sub','sup','ins','mark','emoji','todo','latex','yuml','echarts']）
// [...config.markdown,...config.components].forEach(item => {
//     if(!/^audio-player|table|todogroup|img$/.test(item)){
//         md.use(require(`./plugins/${item}`));
//     };
// });
md.use(require('./plugins/sub'));md.use(require('./plugins/sup'));md.use(require('./plugins/ins'));md.use(require('./plugins/mark'));md.use(require('./plugins/emoji'));md.use(require('./plugins/todo'));md.use(require('./plugins/echarts'));md.use(require('./plugins/latex'));md.use(require('./plugins/yuml'));

// 定义emoji渲染规则
md.renderer.rules.emoji = (token, index) => {
    let item = token[index];
    return `<g-emoji class="h2w__emoji h2w__emoji--${item.markup}">${item.content}</g-emoji>`;
};

// Complete images use the original rule; an unfinished image never becomes visible URL text.
md.inline.ruler.after('image', 'pending_image', (state, silent) => {
    if (silent || !state.env.streaming && !state.env.images?.length) return false;
    const tail = state.src.slice(state.pos, state.posMax);
    if (!tail.startsWith('![') || tail.includes('\n')) return false;
    const protectedDepth = state.tokens.reduce((level, token) => {
        const html = token.type === 'html_inline' && /^<(\/?)(?:a|code|pre)\b/i.exec(token.content);
        return level + (token.tag === 'a' ? token.nesting : html ? (html[1] ? -1 : 1) : 0);
    }, 0);
    if (protectedDepth > 0) return false;
    const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
    const destination = labelEnd < 0 ? '' : state.src.slice(labelEnd + 1, state.posMax);
    if (destination && !destination.startsWith('(')) return false;
    let depth = destination ? 1 : 0;
    for (let index = 1; index < destination.length; index++) {
        if (destination[index] === '\\') { index++; continue; }
        if (destination[index] === '(') depth++;
        if (destination[index] === ')' && --depth === 0) return false;
    }
    const image = state.push('image', 'img', 0);
    image.attrs = [['src', ''], ['alt', ''], ['data-image-pending', 'true'],
        ['data-image-prefix', destination.slice(1).replace(/^</, '')]];
    image.children = [];
    state.pos = state.posMax;
    return true;
});

// Hold a delivered file's incomplete destination without making a partial URL clickable.
md.inline.ruler.after('link', 'pending_file_link', (state, silent) => {
    if (silent || state.src[state.pos] !== '[' || !state.env.files?.length) return false;
    const tail = state.src.slice(state.pos, state.posMax);
    if (tail.includes('\n')) return false;
    const protectedDepth = state.tokens.reduce((level, token) => {
        const html = token.type === 'html_inline' && /^<(\/?)(?:a|code|pre)\b/i.exec(token.content);
        return level + (token.tag === 'a' ? token.nesting : html ? (html[1] ? -1 : 1) : 0);
    }, 0);
    if (protectedDepth > 0) return false;
    const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, false);
    if (labelEnd < 0 || state.src[labelEnd + 1] !== '(') return false;
    const destination = state.src.slice(labelEnd + 2, state.posMax);
    const parsed = state.md.helpers.parseLinkDestination(destination, 0, destination.length);
    const prefix = state.md.utils.unescapeAll((parsed.ok ? parsed.str :
        destination.trimStart().replace(/^</, '')).replace(/\\$/, ''));
    if (!state.env.files.some(file => file.url?.startsWith(prefix))) return false;
    let depth = 1;
    for (let index = 0; index < destination.length; index++) {
        if (destination[index] === '\\') { index++; continue; }
        if (destination[index] === '(') depth++;
        if (destination[index] === ')' && --depth === 0) return false;
    }
    const link = state.push('link_open', 'a', 1);
    link.attrs = [['data-link-pending', 'true']];
    state.md.inline.parse(state.src.slice(state.pos + 1, labelEnd), state.md, state.env, state.tokens);
    state.push('link_close', 'a', -1);
    state.pos = state.posMax;
    return true;
});

// 引用规则复用 Markdown token 渲染，避免改写代码、转义或链接里的正文。
md.inline.ruler.after('link', 'citation', (state, silent) => {
    if (silent || state.src[state.pos] !== '[') return false;
    const match = /^\[ref_([1-9]\d*)\]/.exec(state.src.slice(state.pos, state.posMax));
    const url = match && state.env.citationUrls?.get(Number(match[1]));
    if (!url) return false;
    // Keep explicit links and raw HTML code intact; Markdown code/escapes are handled by earlier rules.
    const protectedDepth = state.tokens.reduce((level, token) => {
        const html = token.type === 'html_inline' && /^<(\/?)(?:a|code|pre)\b/i.exec(token.content);
        return level + (token.tag === 'a' ? token.nesting : html ? (html[1] ? -1 : 1) : 0);
    }, 0);
    if (protectedDepth > 0) return false;
    state.push('sup_open', 'sup', 1);
    const link = state.push('link_open', 'a', 1);
    link.attrs = [['href', url], ['data-citation', 'true']];
    state.push('text', '', 0).content = match[1];
    state.push('link_close', 'a', -1);
    state.push('sup_close', 'sup', -1);
    state.pos += match[0].length;
    return true;
});

// 导出模块
module.exports = (str, env) => {
    return md.render(str, env);
};
