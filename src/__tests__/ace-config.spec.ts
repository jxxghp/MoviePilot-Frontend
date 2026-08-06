import ace from 'ace-builds'
import { describe, expect, it } from 'vitest'
import '@/ace-config'

interface AceToken {
  type: string
  value: string
}

interface WordListMode {
  getTokenizer: () => {
    getLineTokens: (line: string, state: string) => { tokens: AceToken[] }
  }
}

const WordListMode = ace.require('ace/mode/word_list').Mode as new (options?: { syntax?: boolean }) => WordListMode
const syntaxTokenizer = new WordListMode({ syntax: true }).getTokenizer()
const plainTokenizer = new WordListMode().getTokenizer()

function tokenize(line: string) {
  return syntaxTokenizer.getLineTokens(line, 'start').tokens
}

function tokenizePlain(line: string) {
  return plainTokenizer.getLineTokens(line, 'start').tokens
}

describe('word list syntax mode', () => {
  it('highlights a block word as one field', () => {
    expect(tokenize('屏蔽词')).toEqual([{ type: 'word_list_block', value: '屏蔽词' }])
  })

  it('parses valid replacement parameters', () => {
    expect(tokenize('旧名.* => 新名 {[tmdbid=123;type=tv]}')).toEqual([
      { type: 'word_list_replaced', value: '旧名.*' },
      { type: 'keyword.operator.word-list', value: ' => ' },
      { type: 'word_list_replacement', value: '新名 ' },
      { type: 'word_list_parameter_syntax', value: '{[' },
      { type: 'word_list_parameter_key', value: 'tmdbid' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'word_list_parameter_value', value: '123' },
      { type: 'word_list_parameter_syntax', value: ';' },
      { type: 'word_list_parameter_key', value: 'type' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'word_list_parameter_value', value: 'tv' },
      { type: 'word_list_parameter_syntax', value: ']}' },
    ])
  })

  it('marks invalid replacement parameter keys and values', () => {
    expect(tokenize('旧名 => 新名 {[unknown=1;tmdbid=abc;type=anime;g=group;s=2;e=3]}')).toEqual([
      { type: 'word_list_replaced', value: '旧名' },
      { type: 'keyword.operator.word-list', value: ' => ' },
      { type: 'word_list_replacement', value: '新名 ' },
      { type: 'word_list_parameter_syntax', value: '{[' },
      { type: 'invalid.word-list', value: 'unknown' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'word_list_parameter_value', value: '1' },
      { type: 'word_list_parameter_syntax', value: ';' },
      { type: 'word_list_parameter_key', value: 'tmdbid' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'invalid.word-list', value: 'abc' },
      { type: 'word_list_parameter_syntax', value: ';' },
      { type: 'word_list_parameter_key', value: 'type' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'invalid.word-list', value: 'anime' },
      { type: 'word_list_parameter_syntax', value: ';' },
      { type: 'word_list_parameter_key', value: 'g' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'word_list_parameter_value', value: 'group' },
      { type: 'word_list_parameter_syntax', value: ';' },
      { type: 'word_list_parameter_key', value: 's' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'word_list_parameter_value', value: '2' },
      { type: 'word_list_parameter_syntax', value: ';' },
      { type: 'word_list_parameter_key', value: 'e' },
      { type: 'word_list_parameter_syntax', value: '=' },
      { type: 'word_list_parameter_value', value: '3' },
      { type: 'word_list_parameter_syntax', value: ']}' },
    ])
  })

  it('marks an unknown replacement parameter key as invalid', () => {
    expect(tokenize('旧名 => {[unknown=1]}')).toContainEqual({ type: 'invalid.word-list', value: 'unknown' })
  })

  it('marks visible syntax for missing or malformed replacement parameters', () => {
    const invalidTokenValues = tokenize('旧名 => {[tmdbid=;=123;broken;;]}')
      .filter(token => token.type === 'invalid.word-list')
      .map(token => token.value)

    expect(invalidTokenValues).toEqual(['tmdbid=', '=123', 'broken;;'])
    expect(tokenize('旧名 => {[]}')).toContainEqual({ type: 'invalid.word-list', value: '{[]}' })
  })

  it('marks the second semicolon when it creates an empty parameter', () => {
    const semicolonTokens = tokenize('旧名 => {[tmdbid=1;;type=tv]}').filter(token => token.value.includes(';'))

    expect(semicolonTokens).toEqual([{ type: 'invalid.word-list', value: ';;' }])
  })

  it('marks both sides of missing keys and values', () => {
    const invalidTokenValues = tokenize('旧名 => {[tmdbid=;=123]}')
      .filter(token => token.type === 'invalid.word-list')
      .map(token => token.value)

    expect(invalidTokenValues).toEqual(['tmdbid=', '=123'])
  })

  it('treats an unclosed parameter block as ordinary replacement text', () => {
    expect(tokenize('旧名 => 新名 {[tmdbid=1')).toEqual([
      { type: 'word_list_replaced', value: '旧名' },
      { type: 'keyword.operator.word-list', value: ' => ' },
      { type: 'word_list_replacement', value: '新名 {[tmdbid=1' },
    ])
  })

  it('accepts every supported replacement parameter type', () => {
    expect(
      tokenize('旧名 => {[tmdbid=1;doubanid=2;bangumiid=3;anilistid=4;type=movie;g=group;s=5;e=6]}'),
    ).not.toContainEqual(expect.objectContaining({ type: 'invalid.word-list' }))
  })

  it('accepts season and episode number ranges', () => {
    expect(tokenize('旧名 => {[s=1-2;e=3-5]}')).not.toContainEqual(
      expect.objectContaining({ type: 'invalid.word-list' }),
    )
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

  it('highlights comment lines', () => {
    expect(tokenize('# 这是一个注释')).toEqual([{ type: 'comment.word-list', value: '# 这是一个注释' }])
  })
})

describe('word list plain mode', () => {
  it('does not highlight comment lines', () => {
    expect(tokenizePlain('# 这是一个注释')).toEqual([{ type: 'text', value: '# 这是一个注释' }])
  })

  it('does not highlight word list fields', () => {
    expect(tokenizePlain('旧名 => 新名 && 第 <> 集 >> 2*EP-1')).toEqual([
      { type: 'text', value: '旧名 => 新名 && 第 <> 集 >> 2*EP-1' },
    ])
  })

  it('returns no tokens for empty lines', () => {
    expect(tokenizePlain('')).toEqual([])
  })
})
