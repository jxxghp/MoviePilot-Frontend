import ace from 'ace-builds'
import { describe, expect, it } from 'vitest'
import '@/ace-config'

interface AceToken {
  type: string
  value: string
}

interface WordListSyntaxMode {
  getTokenizer: () => {
    getLineTokens: (line: string, state: string) => { tokens: AceToken[] }
  }
}

const WordListSyntaxMode = ace.require('ace/mode/word_list_syntax').Mode as new () => WordListSyntaxMode
const tokenizer = new WordListSyntaxMode().getTokenizer()

function tokenize(line: string) {
  return tokenizer.getLineTokens(line, 'start').tokens
}

describe('word list syntax mode', () => {
  it('highlights a block word as one field', () => {
    expect(tokenize('屏蔽词')).toEqual([{ type: 'word_list_block', value: '屏蔽词' }])
  })

  it('separates replaced and replacement fields without parsing their content', () => {
    expect(tokenize('旧名.* => 新名 {[tmdbid=123;type=tv]}')).toEqual([
      { type: 'word_list_replaced', value: '旧名.*' },
      { type: 'keyword.operator.word-list', value: ' => ' },
      { type: 'word_list_replacement', value: '新名 {[tmdbid=123;type=tv]}' },
    ])
  })

  it('separates front, back, and episode offset fields', () => {
    expect(tokenize('第 <> 集 >> EP+1')).toEqual([
      { type: 'word_list_front', value: '第' },
      { type: 'keyword.operator.word-list', value: ' <> ' },
      { type: 'word_list_back', value: '集' },
      { type: 'keyword.operator.word-list', value: ' >> ' },
      { type: 'word_list_offset', value: 'EP+1' },
    ])
  })

  it('uses all six field types in combined and standalone rules', () => {
    const combinedTokens = tokenize('旧名 => 新名 && 第 <> 集 >> 2*EP-1')

    expect(combinedTokens).toEqual([
      { type: 'word_list_replaced', value: '旧名' },
      { type: 'keyword.operator.word-list', value: ' => ' },
      { type: 'word_list_replacement', value: '新名' },
      { type: 'keyword.operator.word-list', value: ' && ' },
      { type: 'word_list_front', value: '第' },
      { type: 'keyword.operator.word-list', value: ' <> ' },
      { type: 'word_list_back', value: '集' },
      { type: 'keyword.operator.word-list', value: ' >> ' },
      { type: 'word_list_offset', value: '2*EP-1' },
    ])
    expect(tokenize('屏蔽词')[0].type).toBe('word_list_block')
  })
})
