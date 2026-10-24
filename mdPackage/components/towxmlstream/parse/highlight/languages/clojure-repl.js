/*
Language: Clojure REPL
Description: Clojure REPL sessions
Requires: clojure.js
Category: lisp
*/

export default function(hljs) {
  return {
    name: 'Clojure REPL',
    contains: [
      {
        className: 'meta',
        begin: /^([\w.-]+|\s*#_)?=>/,
        starts: {
          end: /$/,
          subLanguage: 'clojure'
        }
      }
    ]
  }
}
