/*
Language: C++
Category: common, system
Requires: c-like.js
*/

export default function(hljs) {

  var lang = hljs.getLanguage('c-like').rawDefinition();
  // return auto-detection back on
  lang.disableAutodetect = false;
  lang.name = 'C++';
  lang.aliases = ['cc', 'c++', 'h++', 'hpp', 'hh', 'hxx', 'cxx'];
  return lang;
}
