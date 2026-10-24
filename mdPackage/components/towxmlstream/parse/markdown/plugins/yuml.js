const chart = (code, format, escapeAttr) => {
    return `<yuml value="${escapeAttr(code)}" format="${format}"></yuml>`;
}

module.exports = md => {
    const temp = md.renderer.rules.fence.bind(md.renderer.rules)
    const escapeAttr = value => md.utils.escapeHtml(value);
    md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
        const token = tokens[idx]
        const code = token.content.trim();
        const format = (token.info || '').trim().split(/\s+/)[0].toLowerCase();
        if (format === 'yuml' || format === 'mermaid') {
            return chart(code, format, escapeAttr)
        };
        // const firstLine = code.split(/\n/)[0].trim()
        // if (firstLine === 'gantt' || firstLine === 'sequenceDiagram' || firstLine.match(/^graph (?:TB|BT|RL|LR|TD);?$/)) {
        //     return mermaidChart(code)
        // }
        return temp(tokens, idx, options, env, slf)
    }
};
