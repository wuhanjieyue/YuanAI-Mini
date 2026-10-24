/*
Language: VBScript in HTML
Requires: xml.js, vbscript.js
Description: "Bridge" language defining fragments of VBScript in HTML within <% .. %>
Category: scripting
*/

export default function(hljs) {
  return {
    name: 'VBScript in HTML',
    subLanguage: 'xml',
    contains: [
      {
        begin: '<%', end: '%>',
        subLanguage: 'vbscript'
      }
    ]
  };
}
