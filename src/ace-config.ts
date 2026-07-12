import ace from 'ace-builds'

import modeJsonUrl from 'ace-builds/src-noconflict/mode-json?url'

import modeJavascriptUrl from 'ace-builds/src-noconflict/mode-javascript?url'

import modeHtmlUrl from 'ace-builds/src-noconflict/mode-html?url'

import modeYamlUrl from 'ace-builds/src-noconflict/mode-yaml?url'

import modeCssUrl from 'ace-builds/src-noconflict/mode-css?url'

import modeIniUrl from 'ace-builds/src-noconflict/mode-ini?url'

import themeGithubUrl from 'ace-builds/src-noconflict/theme-github?url'

import themeGithubDarkUrl from 'ace-builds/src-noconflict/theme-github_dark?url'

import themeGithubLightDefaultUrl from 'ace-builds/src-noconflict/theme-github_light_default?url'

import themeChromeUrl from 'ace-builds/src-noconflict/theme-chrome?url'

import themeMonokaiUrl from 'ace-builds/src-noconflict/theme-monokai?url'

import workerBaseUrl from 'ace-builds/src-noconflict/worker-base?url'

import workerJsonUrl from 'ace-builds/src-noconflict/worker-json?url'

import workerJavascriptUrl from 'ace-builds/src-noconflict/worker-javascript?url'

import workerHtmlUrl from 'ace-builds/src-noconflict/worker-html?url'

import workerYamlUrl from 'ace-builds/src-noconflict/worker-yaml?url'

import workerCssUrl from 'ace-builds/src-noconflict/worker-css?url'

import snippetsHtmlUrl from 'ace-builds/src-noconflict/snippets/html?url'

import snippetsJsUrl from 'ace-builds/src-noconflict/snippets/javascript?url'

import snippetsYamlUrl from 'ace-builds/src-noconflict/snippets/yaml?url'

import snippetsJsonUrl from 'ace-builds/src-noconflict/snippets/json?url'

import snippertsCssUrl from 'ace-builds/src-noconflict/snippets/css?url'

import snippertsIniUrl from 'ace-builds/src-noconflict/snippets/ini?url'

import 'ace-builds/src-noconflict/ext-language_tools'

const aceModule = ace as typeof ace & {
  define?: (moduleName: string, deps: string[], payload: (...args: any[]) => void) => void
}

function registerJinja2Mode() {
  aceModule.define?.(
    'ace/mode/jinja2_highlight_rules',
    ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
    (require: any, exports: any) => {
      const oop = require('../lib/oop')
      const TextHighlightRules = require('./text_highlight_rules').TextHighlightRules

      const Jinja2HighlightRules = function (this: any) {
        const tags =
          'autoescape|block|call|do|elif|else|endautoescape|endblock|endcall|endfilter|endfor|endif|endmacro|endraw|endset|endtrans|endwith|extends|filter|for|from|if|import|include|macro|raw|set|trans|with'
        const filters =
          'abs|attr|batch|capitalize|center|count|d|default|dictsort|e|escape|filesizeformat|first|float|forceescape|format|groupby|indent|int|items|join|last|length|list|lower|map|max|min|pprint|random|reject|rejectattr|replace|reverse|round|safe|select|selectattr|slice|sort|string|striptags|sum|title|tojson|trim|truncate|unique|upper|urlencode|urlize|wordcount|wordwrap|xmlattr'
        const functions = 'cycler|dict|joiner|lipsum|namespace|range'
        const tests =
          'boolean|defined|divisibleby|eq|escaped|even|false|filter|float|ge|gt|in|integer|iterable|le|lower|lt|mapping|ne|none|number|odd|sameas|sequence|string|test|true|undefined|upper'
        const operators = 'and|in|is|not|or'
        const contextVariables =
          'title|en_title|original_title|season|season_fmt|year|title_year|type|category|vote_average|poster|backdrop|season_year|actors|overview|tmdbid|imdbid|doubanid|episode_title|episode_date|original_name|name|en_name|episode|season_episode|part|customization|fps|resourceType|effect|edition|videoFormat|resource_term|releaseGroup|videoCodec|audioCodec|webSource|torrent_title|pubdate|freedate|seeders|volume_factor|hit_and_run|labels|description|site_name|size|transfer_type|file_count|total_size|err_msg|fileExt|__meta__|__mediainfo__|__torrentinfo__|__transferinfo__|__episodes_info__'

        const keywordMapper = this.createKeywordMapper(
          {
            'keyword.control.jinja2': tags,
            'keyword.operator.jinja2': operators,
            'support.function.jinja2': [filters, functions, tests].join('|'),
            'constant.language.jinja2': 'false|False|none|None|null|true|True',
          },
          'identifier',
        )

        const jinjaExpressionRules = [
          {
            token: 'string',
            regex: "'",
            push: 'jinja2-qstring',
          },
          {
            token: 'string',
            regex: '"',
            push: 'jinja2-qqstring',
          },
          {
            token: 'constant.numeric',
            regex: /[+-]?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/,
          },
          {
            token: ['keyword.operator.other.jinja2', 'text', 'support.function.jinja2'],
            regex: `(\\|)(\\s*)(${filters})\\b`,
          },
          {
            token: ['keyword.operator.jinja2', 'text', 'support.function.jinja2'],
            regex: `(\\bis\\b)(\\s*)(${tests})\\b`,
          },
          {
            token: ['support.function.jinja2', 'text', 'paren.lparen'],
            regex: `\\b(${functions})(\\s*)(\\()`,
          },
          {
            token: 'variable.language.jinja2',
            regex: `\\b(?:${contextVariables})\\b`,
          },
          {
            token: keywordMapper,
            regex: /[a-zA-Z_$][a-zA-Z0-9_$]*\b/,
          },
          {
            token: 'keyword.operator.assignment.jinja2',
            regex: /=|~/,
          },
          {
            token: 'keyword.operator.comparison.jinja2',
            regex: /==|!=|<=|>=|<|>/,
          },
          {
            token: 'keyword.operator.arithmetic.jinja2',
            regex: /\+|-|\/\/|\/|%|\*\*|\*/,
          },
          {
            token: 'keyword.operator.other.jinja2',
            regex: /\.{2}|\||:/,
          },
          {
            token: 'punctuation.operator.jinja2',
            regex: /[.,;?]/,
          },
          {
            token: 'paren.lparen',
            regex: /[\[({]/,
          },
          {
            token: 'paren.rparen',
            regex: /[\])}]/,
          },
          {
            token: 'text',
            regex: /\s+/,
          },
        ]

        this.$rules = {
          start: [
            {
              token: 'comment.block.jinja2',
              regex: /\{#-?/,
              push: 'jinja2-comment',
            },
            {
              token: 'constant.language.jinja2',
              regex: /\{\{-?/,
              push: 'jinja2-expression',
            },
            {
              token: 'keyword.control.jinja2',
              regex: /\{%-?/,
              push: 'jinja2-statement',
            },
          ],
          'jinja2-comment': [
            {
              token: 'comment.block.jinja2',
              regex: /-?#\}/,
              next: 'pop',
            },
            {
              defaultToken: 'comment.block.jinja2',
            },
          ],
          'jinja2-expression': [
            {
              token: 'constant.language.jinja2',
              regex: /-?\}\}/,
              next: 'pop',
            },
            ...jinjaExpressionRules,
          ],
          'jinja2-statement': [
            {
              token: 'keyword.control.jinja2',
              regex: /-?%\}/,
              next: 'pop',
            },
            ...jinjaExpressionRules,
          ],
          'jinja2-qqstring': [
            {
              token: 'constant.language.escape',
              regex: /\\[\\"ntr]/,
            },
            {
              token: 'string',
              regex: '"',
              next: 'pop',
            },
            {
              defaultToken: 'string',
            },
          ],
          'jinja2-qstring': [
            {
              token: 'constant.language.escape',
              regex: /\\[\\'ntr]/,
            },
            {
              token: 'string',
              regex: "'",
              next: 'pop',
            },
            {
              defaultToken: 'string',
            },
          ],
        }

        this.normalizeRules()
      }

      oop.inherits(Jinja2HighlightRules, TextHighlightRules)
      exports.Jinja2HighlightRules = Jinja2HighlightRules
    },
  )

  aceModule.define?.(
    'ace/mode/jinja2',
    ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/jinja2_highlight_rules'],
    (require: any, exports: any) => {
      const oop = require('../lib/oop')
      const TextMode = require('./text').Mode
      const Jinja2HighlightRules = require('./jinja2_highlight_rules').Jinja2HighlightRules

      const Mode = function (this: any) {
        TextMode.call(this)
        this.HighlightRules = Jinja2HighlightRules
      }

      oop.inherits(Mode, TextMode)

      ;(function (this: any) {
        this.$id = 'ace/mode/jinja2'
        this.blockComment = { start: '{#', end: '#}' }
      }).call(Mode.prototype)

      exports.Mode = Mode
    },
  )

  aceModule.define?.('ace/snippets/jinja2', ['require', 'exports', 'module'], (_require: any, exports: any) => {
    exports.snippetText =
      'snippet if\n\t{% if ${1:condition} %}\n\t\t${0}\n\t{% endif %}\n' +
      'snippet for\n\t{% for ${1:item} in ${2:items} %}\n\t\t${0}\n\t{% endfor %}\n' +
      'snippet var\n\t{{ ${1:name} }}\n'
    exports.scope = 'jinja2'
  })

  aceModule.define?.(
    'ace/mode/jinja2_json_highlight_rules',
    ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
    (require: any, exports: any) => {
      const oop = require('../lib/oop')
      const TextHighlightRules = require('./text_highlight_rules').TextHighlightRules

      const Jinja2JsonHighlightRules = function (this: any) {
        const tags =
          'autoescape|block|call|do|elif|else|endautoescape|endblock|endcall|endfilter|endfor|endif|endmacro|endraw|endset|endtrans|endwith|extends|filter|for|from|if|import|include|macro|raw|set|trans|with'
        const filters =
          'abs|attr|batch|capitalize|center|count|d|default|dictsort|e|escape|filesizeformat|first|float|forceescape|format|groupby|indent|int|items|join|last|length|list|lower|map|max|min|pprint|random|reject|rejectattr|replace|reverse|round|safe|select|selectattr|slice|sort|string|striptags|sum|title|tojson|trim|truncate|unique|upper|urlencode|urlize|wordcount|wordwrap|xmlattr'
        const functions = 'cycler|dict|joiner|lipsum|namespace|range'
        const tests =
          'boolean|defined|divisibleby|eq|escaped|even|false|filter|float|ge|gt|in|integer|iterable|le|lower|lt|mapping|ne|none|number|odd|sameas|sequence|string|test|true|undefined|upper'
        const operators = 'and|in|is|not|or'
        const contextVariables =
          'title|en_title|original_title|season|season_fmt|year|title_year|type|category|vote_average|poster|backdrop|season_year|actors|overview|tmdbid|imdbid|doubanid|episode_title|episode_date|original_name|name|en_name|episode|season_episode|part|customization|fps|resourceType|effect|edition|videoFormat|resource_term|releaseGroup|videoCodec|audioCodec|webSource|torrent_title|pubdate|freedate|seeders|volume_factor|hit_and_run|labels|description|site_name|size|transfer_type|file_count|total_size|err_msg|fileExt|__meta__|__mediainfo__|__torrentinfo__|__transferinfo__|__episodes_info__'

        const keywordMapper = this.createKeywordMapper(
          {
            'keyword.control.jinja2': tags,
            'keyword.operator.jinja2': operators,
            'support.function.jinja2': [filters, functions, tests].join('|'),
            'constant.language.jinja2': 'false|False|none|None|null|true|True',
          },
          'identifier',
        )

        const jinjaRules = [
          {
            token: 'string',
            regex: "'",
            push: 'jinja2-json-qstring',
          },
          {
            token: 'constant.language.escape',
            regex: /\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|["\\\/bfnrt])/,
          },
          {
            token: 'constant.numeric',
            regex: /[+-]?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/,
          },
          {
            token: ['keyword.operator.other.jinja2', 'text', 'support.function.jinja2'],
            regex: `(\\|)(\\s*)(${filters})\\b`,
          },
          {
            token: ['keyword.operator.jinja2', 'text', 'support.function.jinja2'],
            regex: `(\\bis\\b)(\\s*)(${tests})\\b`,
          },
          {
            token: ['support.function.jinja2', 'text', 'paren.lparen'],
            regex: `\\b(${functions})(\\s*)(\\()`,
          },
          {
            token: 'variable.language.jinja2',
            regex: `\\b(?:${contextVariables})\\b`,
          },
          {
            token: keywordMapper,
            regex: /[a-zA-Z_$][a-zA-Z0-9_$]*\b/,
          },
          {
            token: 'keyword.operator.assignment.jinja2',
            regex: /=|~/,
          },
          {
            token: 'keyword.operator.comparison.jinja2',
            regex: /==|!=|<=|>=|<|>/,
          },
          {
            token: 'keyword.operator.arithmetic.jinja2',
            regex: /\+|-|\/\/|\/|%|\*\*|\*/,
          },
          {
            token: 'keyword.operator.other.jinja2',
            regex: /\.{2}|\||:/,
          },
          {
            token: 'punctuation.operator.jinja2',
            regex: /[.,;?]/,
          },
          {
            token: 'paren.lparen',
            regex: /[\[({]/,
          },
          {
            token: 'paren.rparen',
            regex: /[\])}]/,
          },
          {
            token: 'text',
            regex: /\s+/,
          },
        ]

        this.$rules = {
          start: [
            {
              token: 'variable',
              regex: /"(?:(?:\\.)|(?:[^"\\]))*?"\s*(?=:)/,
            },
            {
              token: 'string',
              regex: '"',
              push: 'json-string',
            },
            {
              token: 'constant.numeric',
              regex: /0[xX][0-9a-fA-F]+\b/,
            },
            {
              token: 'constant.numeric',
              regex: /[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?\b/,
            },
            {
              token: 'constant.language.boolean',
              regex: /(?:true|false|null)\b/,
            },
            {
              token: 'text',
              regex: /['](?:(?:\\.)|(?:[^'\\]))*?[']/,
            },
            {
              token: 'comment',
              regex: /\/\/.*$/,
            },
            {
              token: 'comment.start',
              regex: /\/\*/,
              push: 'comment',
            },
            {
              token: 'paren.lparen',
              regex: /[[({]/,
            },
            {
              token: 'paren.rparen',
              regex: /[\])}]/,
            },
            {
              token: 'punctuation.operator',
              regex: /[:,]/,
            },
            {
              token: 'text',
              regex: /\s+/,
            },
          ],
          'json-string': [
            {
              token: 'constant.language.escape',
              regex: /\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|["\\\/bfnrt])/,
            },
            {
              token: 'comment.block.jinja2',
              regex: /\{#-?/,
              push: 'jinja2-json-comment',
            },
            {
              token: 'constant.language.jinja2',
              regex: /\{\{-?/,
              push: 'jinja2-json-expression',
            },
            {
              token: 'keyword.control.jinja2',
              regex: /\{%-?/,
              push: 'jinja2-json-statement',
            },
            {
              token: 'string',
              regex: /"|$/,
              next: 'pop',
            },
            {
              defaultToken: 'string',
            },
          ],
          comment: [
            {
              token: 'comment.end',
              regex: /\*\//,
              next: 'pop',
            },
            {
              defaultToken: 'comment',
            },
          ],
          'jinja2-json-comment': [
            {
              token: 'comment.block.jinja2',
              regex: /-?#\}/,
              next: 'pop',
            },
            {
              defaultToken: 'comment.block.jinja2',
            },
          ],
          'jinja2-json-expression': [
            {
              token: 'constant.language.jinja2',
              regex: /-?\}\}/,
              next: 'pop',
            },
            ...jinjaRules,
          ],
          'jinja2-json-statement': [
            {
              token: 'keyword.control.jinja2',
              regex: /-?%\}/,
              next: 'pop',
            },
            ...jinjaRules,
          ],
          'jinja2-json-qstring': [
            {
              token: 'constant.language.escape',
              regex: /\\[\\'ntr]/,
            },
            {
              token: 'string',
              regex: "'",
              next: 'pop',
            },
            {
              defaultToken: 'string',
            },
          ],
        }

        this.normalizeRules()
      }

      oop.inherits(Jinja2JsonHighlightRules, TextHighlightRules)
      exports.Jinja2JsonHighlightRules = Jinja2JsonHighlightRules
    },
  )

  aceModule.define?.(
    'ace/mode/jinja2_json',
    ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/jinja2_json_highlight_rules'],
    (require: any, exports: any) => {
      const oop = require('../lib/oop')
      const TextMode = require('./text').Mode
      const Jinja2JsonHighlightRules = require('./jinja2_json_highlight_rules').Jinja2JsonHighlightRules

      const Mode = function (this: any) {
        TextMode.call(this)
        this.HighlightRules = Jinja2JsonHighlightRules
      }

      oop.inherits(Mode, TextMode)

      ;(function (this: any) {
        this.lineCommentStart = '//'
        this.blockComment = { start: '/*', end: '*/' }
        this.$id = 'ace/mode/jinja2_json'
      }).call(Mode.prototype)

      exports.Mode = Mode
    },
  )
}

function registerWordListMode() {
  aceModule.define?.(
    'ace/mode/word_list_highlight_rules',
    ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'],
    (require: any, exports: any) => {
      const oop = require('../lib/oop')
      const TextHighlightRules = require('./text_highlight_rules').TextHighlightRules

      const WordListHighlightRules = function (this: any) {
        this.$rules = {
          start: [
            {
              token: 'comment.word-list',
              regex: /^#.*/,
            },
          ],
        }

        this.normalizeRules()
      }

      oop.inherits(WordListHighlightRules, TextHighlightRules)
      exports.WordListHighlightRules = WordListHighlightRules
    },
  )

  aceModule.define?.(
    'ace/mode/word_list',
    ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/word_list_highlight_rules'],
    (require: any, exports: any) => {
      const oop = require('../lib/oop')
      const TextMode = require('./text').Mode
      const WordListHighlightRules = require('./word_list_highlight_rules').WordListHighlightRules

      const Mode = function (this: any) {
        TextMode.call(this)
        this.HighlightRules = WordListHighlightRules
      }

      oop.inherits(Mode, TextMode)

      ;(function (this: any) {
        this.$id = 'ace/mode/word_list'
      }).call(Mode.prototype)

      exports.Mode = Mode
    },
  )
}

ace.config.setModuleUrl('ace/mode/json', modeJsonUrl)
ace.config.setModuleUrl('ace/mode/javascript', modeJavascriptUrl)
ace.config.setModuleUrl('ace/mode/html', modeHtmlUrl)
ace.config.setModuleUrl('ace/mode/yaml', modeYamlUrl)
ace.config.setModuleUrl('ace/mode/css', modeCssUrl)
ace.config.setModuleUrl('ace/mode/ini', modeIniUrl)
ace.config.setModuleUrl('ace/theme/github', themeGithubUrl)
ace.config.setModuleUrl('ace/theme/github_dark', themeGithubDarkUrl)
ace.config.setModuleUrl('ace/theme/github_light_default', themeGithubLightDefaultUrl)
ace.config.setModuleUrl('ace/theme/chrome', themeChromeUrl)
ace.config.setModuleUrl('ace/theme/monokai', themeMonokaiUrl)
ace.config.setModuleUrl('ace/mode/base', workerBaseUrl)
ace.config.setModuleUrl('ace/mode/json_worker', workerJsonUrl)
ace.config.setModuleUrl('ace/mode/javascript_worker', workerJavascriptUrl)
ace.config.setModuleUrl('ace/mode/html_worker', workerHtmlUrl)
ace.config.setModuleUrl('ace/mode/yaml_worker', workerYamlUrl)
ace.config.setModuleUrl('ace/mode/css_worker', workerCssUrl)
ace.config.setModuleUrl('ace/snippets/html', snippetsHtmlUrl)
ace.config.setModuleUrl('ace/snippets/javascript', snippetsJsUrl)
ace.config.setModuleUrl('ace/snippets/yaml', snippetsYamlUrl)
ace.config.setModuleUrl('ace/snippets/json', snippetsJsonUrl)
ace.config.setModuleUrl('ace/snippets/css', snippertsCssUrl)
ace.config.setModuleUrl('ace/snippets/ini', snippertsIniUrl)

registerJinja2Mode()
registerWordListMode()
ace.require('ace/ext/language_tools')
