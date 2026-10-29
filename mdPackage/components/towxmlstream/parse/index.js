const parse2 = require('./parse2/index'),
    config = require('../config'),
    {createEventContext} = require('../render-context'),
    {parseArtifactLink, artifactAttachmentDetail} = require('../../../../static_utils/chatArtifacts'),
    {mergeGeneratedImages} = require('../../../../static_utils/generatedImages'),
    {knowledgeCitationId} = require('../../../../static_utils/chatSources'),

    // Skyline 下的内联内容必须使用 span，不能使用 display:inline 的 view。
    skylineInlineTags = new Set([
        'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'del', 'dfn', 'em',
        'g-emoji', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small',
        'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
    ]),

    skylineInlineContainers = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']),

    inlineClassReg = /\bh2w__(?:a|abbr|b|bdi|bdo|cite|code|del|dfn|em|g-emoji|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr)\b/,

    isWhitespaceText = node => node && node.tag === undefined && typeof node.text === 'string' && !node.text.replace(/\u00a0/g, ' ').trim(),

    getNodeText = node => {
        if(!node){
            return '';
        }
        if(node.tag === undefined){
            return node.text || '';
        }
        if(node.tag === 'br'){
            return '\n';
        }
        if(node.attrs && node.attrs.alt){
            return node.attrs.alt;
        }
        return (node.children || []).map(getNodeText).join('');
    },

    isInlineNode = node => {
        if(!node){
            return false;
        }
        if(node.tag === undefined || node.tag === 'br'){
            return true;
        }
        if(node.tag === 'navigator'){
            return (node.children || []).every(child => child.tag === undefined || child.tag === 'br');
        }
        if(node.tag === 'text'){
            return (node.children || []).every(child => child.tag === undefined);
        }
        if(skylineInlineTags.has(node.tag)){
            return (node.children || []).every(isInlineNode);
        }
        return inlineClassReg.test(node.attrs && node.attrs.class || '') &&
            (node.children || []).every(isInlineNode);
    },

    compactChildren = (children, childEvents, inCode) => {
        if(inCode || !children.length){
            return {children, childEvents};
        }

        const result = [],
            resultEvents = [];

        children.forEach((node, index) => {
            if(isWhitespaceText(node)){
                let previous = index - 1,
                    next = index + 1;

                while(previous >= 0 && isWhitespaceText(children[previous])){
                    previous -= 1;
                }
                while(next < children.length && isWhitespaceText(children[next])){
                    next += 1;
                }

                // 块级节点之间的换行只是格式化空白；两个内联节点之间的空格必须保留。
                if(previous < 0 || next >= children.length || !isInlineNode(children[previous]) || !isInlineNode(children[next])){
                    return;
                }
            }
            result.push(node);
            resultEvents.push(childEvents[index]);
        });

        return {children:result, childEvents:resultEvents};
    },

    buildCodeLines = children => {
        const lines = [{tokens:[]}],
            append = (node, inheritedClass) => {
                if(node.tag === 'view' && /\bh2w__lineNum\b/.test(node.attrs && node.attrs.class || '')){
                    return;
                }
                if(node.tag === 'br'){
                    lines.push({tokens:[]});
                    return;
                }

                const className = node.attrs && node.attrs.class || inheritedClass || '';
                if(node.tag === undefined){
                    lines[lines.length - 1].tokens.push({text:node.text || '', class:className});
                    return;
                }
                (node.children || []).forEach(child => append(child,className));
            };

        (children || []).forEach(child => append(child,''));
        if(lines.length > 1 && !lines[lines.length - 1].tokens.length){
            lines.pop();
        }
        return lines;
    },

    // html与wxml转换关系
    correspondTag = (()=>{
        let result = {
                a:'navigator',
                todogroup:'checkbox-group',
                audio:'audio-player'
            };
        

        // 该系列小程序原生tag，不需转换
        [...config.wxml,...config.components].forEach(item => {
            result[item] = item;
        });
        return result;
    })(),

    // 元素与html对应的wxml标签名
    getWxmlTag = (tagStr, skyline, inCode) => {
        if(!tagStr){
            return undefined;
        }
        if(skyline && tagStr === 'code' && inCode){
            return 'view';
        }
        if(tagStr === 'br'){
            return 'br';
        }
        if(skyline && skylineInlineTags.has(tagStr)){
            return 'span';
        }
        if(skyline && tagStr === 'pre'){
            return 'scroll-view';
        }
        return correspondTag[tagStr] || 'view';
    },

    // 依赖父级的元素
    relyList = ['li'],

    // 精简数据，并初始化相关事件等
    initObj = (obj,option)=>{
        option = option || {};
        const result = {
                theme:option.theme || 'light',
                _e:{}
            },
            base = option.base,
            images = mergeGeneratedImages([], (option.images || []).filter(item => item?.artifactType === 'image'));

        if(option.events){
            result.eventContextId = createEventContext(option.events).id;
        };

        // 遍历原始数据，处理成能解析的数据
        let eachFn;
        (eachFn = (arr,obj,_e,isRichTextContent,inCode) => {
            obj.children = obj.children || [];
            _e.child = _e.child || [];
            let child = obj.children,
                child_e = _e.child;
            
            let listIndex = 0;
            arr.forEach(item => {
                if(item.type === 'comment'){
                    return;
                };
                let o = {
                        type:item.type === 'text' ? 'text' : isRichTextContent ? 'node' : item.type
                    },
                    e = {},
                    attrs = o.attrs = item.attribs || {};
                if(item.type === 'text'){
                    o.text = e.text = item.data;
                }else{
                    if(isRichTextContent){
                        o.name = item.name;
                    }else{
                        o.tag = getWxmlTag(item.name, option.skyline !== false, inCode);      // 转换之后的标签
                        // o.tag = o.tag === 'text' ? 'view' : o.tag;
                        e.tag = item.name;                  // 原始
                        o.attrs = item.attribs;
                        e.attrs = JSON.parse(JSON.stringify(attrs));
                        if(item.name === 'br'){
                            o.text = '\n';
                        }
                    };
                    if(item.name === 'a' && (attrs['data-citation'] === 'true' || knowledgeCitationId(attrs.href))){
                        // Skyline navigator is a block; citations must stay inside the prose span.
                        o.tag = 'span';
                        if(attrs['data-citation'] === 'true') attrs.class = `${attrs.class || ''} h2w__citation`.trim();
                        attrs['data-citation'] = 'true';
                        if(!/^https?:\/\/[^\s<>"\x00-\x1f]+$/.test(attrs.href || '')) delete attrs.href;
                    }
                    if(item.name === 'a' && attrs['data-link-pending'] === 'true'){
                        o.tag = 'span';
                        result.pendingLink = true;
                    }
                    if(item.name === 'a' && (/^artifact:/i.test(attrs.href || '') ||
                        artifactAttachmentDetail([...(option.images || []), ...(option.files || [])], attrs.href))){
                        o.tag = 'span';
                        o.artifactLink = true;
                        if(/^artifact:/i.test(attrs.href || '') && !parseArtifactLink(attrs.href)) delete attrs.href;
                    }
                    if(item.name === 'a' && !o.artifactLink && attrs['data-citation'] !== 'true' &&
                        /^https?:\/\/[^\s<>"\\\x00-\x1f]+$/i.test(attrs.href || '')){
                        o.tag = 'span';
                        o.webLink = true;
                    }
                    attrs.class = attrs.class ? `h2w__${item.name} ${attrs.class}` : `h2w__${item.name}`;

                    if(item.name === 'img'){
                        const pending = attrs['data-image-pending'] === 'true';
                        const source = attrs.src || attrs['data-image-prefix'] || '';
                        const artifactId = parseArtifactLink(source);
                        const sourceKey = value => String(value || '').split(/[?#]/)[0];
                        let image = images.find(part => artifactId ? part.artifactId === artifactId :
                            source && part.url && sourceKey(part.url) === sourceKey(source));
                        if(pending && !image){
                            const matches = images.filter(part => source ? part.url?.startsWith(source) : images.length === 1);
                            if(matches.length === 1) image = matches[0];
                        }
                        if(pending) result.pendingImage = true;
                        // Keep existing cards until a multi-image reference identifies its actual artifact.
                        if(pending && !image && images.length > 1) return;
                        if(image || pending){
                            const waiting = pending && option.streaming !== false;
                            o.generatedImage = {...(image || {artifactId:'markdown_pending', width:576, height:768}),
                                displayMode:'inline', url:waiting ? '' : image?.url || '',
                                status:waiting ? 'generating' : image?.status || 'failed'};
                        }
                    }

                    if(['echarts', 'latex', 'yuml'].indexOf(o.tag) > -1){
                        o.theme = result.theme;
                    }

                    const listClass = obj.attrs && obj.attrs.class || '';
                    if(item.name === 'li' && /\bh2w__(ul|ol)\b/.test(listClass) && !/\bh2w__lineNum\b/.test(listClass)){
                        listIndex += 1;
                        o.listMarker = /\bh2w__ol\b/.test(listClass) ? `${listIndex}.` : '•';
                    }
                    
                    // 处理资源相对路径
                    if(base && attrs.src){
                        let src = attrs.src;
                        switch (src.indexOf('//')) {
                            case 0:
                                attrs.src = `https:${src}`;
                            break;
                            case -1:
                                attrs.src = `${base}${src}`;
                            break;
                        };
                    };
                };

                o.rely = relyList.indexOf(e.tag) > -1;      // 判断是否不能嵌套其它标签
                
                if(item.children){
                    eachFn(
                        item.children,
                        o,
                        e,
                        isRichTextContent || item.name === 'rich-text',
                        inCode || /\bh2w__(?:pre|code)\b/.test(attrs.class || '')
                    );
                };
                if(o.tag === 'navigator' && !(o.children || []).every(child => child.tag === undefined || child.tag === 'br')){
                    o.navigatorPlain = true;
                    o.navigatorText = (o.children || []).map(getNodeText).join('');
                }
                if(o.artifactLink){
                    o.artifactText = (o.children || []).map(getNodeText).join('');
                }
                if(o.webLink && (o.children || []).every(isInlineNode)){
                    o.webText = (o.children || []).map(getNodeText).join('');
                }
                if(o.tag === 'text' && !(o.children || []).every(child => child.tag === undefined)){
                    o.textPlain = true;
                    o.textValue = (o.children || []).map(getNodeText).join('');
                }
                if(item.name === 'code' && o.tag === 'view' && inCode){
                    o.codeLines = buildCodeLines(o.children);
                }
                if(item.name === 'pre'){
                    const codeNode = (o.children || []).find(node => node.codeLines);
                    const languageClass = codeNode && codeNode.attrs && codeNode.attrs.class || '';
                    const languageMatch = languageClass.match(/\blanguage-([^\s]+)/);
                    o.codeLanguage = languageMatch ? languageMatch[1] : 'text';
                    o.codeText = codeNode ? codeNode.codeLines.map(line => line.tokens.map(token => token.text).join('')).join('\n').replace(/\u00a0/g, ' ') : getNodeText(o);
                    try {
                        const source = JSON.parse(attrs['data-code-content']);
                        if(typeof source === 'string') o.codeText = source;
                    } catch (_) {}
                    delete attrs['data-code-content'];
                    o.scrollMinHeight = Math.max(1,codeNode ? codeNode.codeLines.length : 1) * 45 + 22;
                }
                if(item.name === 'table'){
                    const rowCount = (o.children || []).reduce((count,section) => count +
                        (section.children || []).filter(node => /\bh2w__tr\b/.test(node.attrs && node.attrs.class || '')).length,0);
                    o.scrollMinHeight = Math.max(1,rowCount) * 68;
                }
                if(item.type !== 'text'){
                    const canInline = (o.children || []).every(isInlineNode);
                    o.inlineContent = option.skyline !== false && (
                        canInline && (
                            skylineInlineContainers.has(item.name) ||
                            (item.name === 'li' && o.children && o.children.length > 0)
                        )
                    );
                }
                child.push(o);
                child_e.push(e);
            });

            if(!isRichTextContent){
                const compacted = compactChildren(child, child_e, inCode);
                obj.children = compacted.children;
                _e.child = compacted.childEvents;
            }
        })(obj,result,result._e,false);
        return result;
    };

module.exports = (str,option) => {
    str = (()=>{
        let re = /<body[^>]*>([\s\S]*)<\/body>/i;
        if(re.test(str)){
            let result = re.exec(str);
            return result[1] || str;
        }else{
            return str;
        };
    })();
    return initObj(parse2(str,{decodeEntities:true}),option);
};
