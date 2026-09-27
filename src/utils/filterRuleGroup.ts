/** 编辑器中的单级过滤规则及其显示优先级。 */
export interface FilterCard {
  pri: string
  rules: string[]
}

/** 将历史和 API 规则串拆为与下拉选项一致的无空格规则 ID。 */
export function parseRuleCards(ruleString: string): FilterCard[] {
  return ruleString.split('>').map((group, index) => ({
    pri: (index + 1).toString(),
    rules: group
      .split('&')
      .map(rule => rule.trim())
      .filter(Boolean),
  }))
}

/** 统一生成可读的规则串，分隔符空格不属于规则 ID。 */
export function serializeRuleCards(cards: FilterCard[]): string {
  return cards
    .filter(card => Array.isArray(card.rules) && card.rules.length > 0)
    .map(card => card.rules.map(rule => rule.trim()).join(' & '))
    .join(' > ')
}
