/**
 * 格式化用户可见的季标签。
 *
 * TMDB 使用季号 0 表示特别季；调用方传入当前语言的特别季名称，
 * 其余季号保持 MoviePilot 现有的 Sxx 展示口径。
 */
export function formatSeasonLabel(
  season: number | string | null | undefined,
  specialsLabel: string,
): string {
  if (season === null || season === undefined || season === '') return ''
  if (Number(season) === 0) return specialsLabel

  return `S${String(season).padStart(2, '0')}`
}
