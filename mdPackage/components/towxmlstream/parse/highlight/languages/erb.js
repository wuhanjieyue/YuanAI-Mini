/*
Language: ERB (Embedded Ruby)
Requires: xml.js, ruby.js
Description: "Bridge" language defining fragments of Ruby in HTML within <% .. %>
Category: template
*/

export default function(hljs) {
  return {
    name: 'ERB',
    subLanguage: 'xml',
    contains: [
      hljs.COMMENT('<%#', '%>'),
      {
        begin: '<%[%=-]?', end: '[%-]?%>',
        subLanguage: 'ruby',
        excludeBegin: true,
        excludeEnd: true
      }
    ]
  };
}
