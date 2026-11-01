import type { SearchDiagnostics } from '@/api/types'

/** 与后端版本1合同一致的脱敏诊断示例。 */
export function createSearchDiagnostics(): SearchDiagnostics {
  return {
    'version': 1,
    'search_id': 'example-search',
    'scope': 'page',
    'searched_sites': [
      {
        'site_id': 1,
        'site_name': '站点 A',
        'attempted': true,
        'outcome': 'empty',
        'raw_count': 0,
      },
      {
        'site_id': 2,
        'site_name': '站点 B',
        'attempted': false,
        'outcome': 'cooldown',
        'raw_count': 0,
      },
    ],
    'stage_counts': {
      'candidates': 0,
      'retained': 0,
    },
    'rejection_reasons': [],
    'rule_groups': [
      {
        'name': '中文字幕',
        'status': 'skipped',
        'reason': 'rule_group_not_applicable',
        'media_type': '电影',
        'categories': ['外语电影'],
      },
    ],
    'warnings': [
      {
        'code': 'rule_group_not_applicable',
        'rule_group': '中文字幕',
      },
    ],
  }
}
