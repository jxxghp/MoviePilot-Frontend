import type { ClassificationCategory } from '@/api/mediaClassificationTypes'

/** 分类下拉标题的可选显示配置。 */
interface ClassificationCategoryOptionTitleOptions {
  emptyPathLabel?: string
  includeId?: boolean
  pathSeparator?: string
}

/** 生成分类选择器标题，避免分类名与路径末级名称重复显示。 */
export function formatClassificationCategoryOptionTitle(
  category: Pick<ClassificationCategory, 'name' | 'path' | 'id'>,
  options: ClassificationCategoryOptionTitleOptions = {},
): string {
  const pathSegments = [...category.path]
  while (pathSegments[pathSegments.length - 1] === category.name) pathSegments.pop()
  const path = pathSegments.join(options.pathSeparator ?? ' / ')
  const displayPath = path || (category.path.length ? '' : (options.emptyPathLabel ?? ''))
  const parts = [category.name, displayPath]
  if (options.includeId) parts.push(category.id)
  return parts.filter(Boolean).join(' · ')
}
