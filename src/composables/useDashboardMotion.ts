import { TransitionPresets, usePreferredReducedMotion, useTransition, type UseTransitionOptions } from '@vueuse/core'
import { computed, type MaybeRefOrGetter } from 'vue'

const fileSizeUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export function useDashboardMotionDisabled() {
  const preferredMotion = usePreferredReducedMotion()

  return computed(() => preferredMotion.value === 'reduce')
}

export function useAnimatedDashboardNumber(source: MaybeRefOrGetter<number>, options: UseTransitionOptions = {}) {
  const disabled = useDashboardMotionDisabled()

  return useTransition(source, {
    duration: 420,
    transition: TransitionPresets.easeOutQuart,
    disabled,
    ...options,
  })
}

export function formatDashboardCount(value: number) {
  return Math.round(Math.max(Number(value) || 0, 0)).toLocaleString()
}

export function formatDashboardFileSize(bytes: number, decimals = 2, targetBytes = bytes) {
  let size = Math.abs(Number(targetBytes) || Number(bytes) || 0)
  let unitIndex = 0

  while (size >= 1024 && unitIndex < fileSizeUnits.length - 1) {
    size /= 1024
    unitIndex++
  }

  const divisor = 1024 ** unitIndex
  const value = (Math.abs(Number(bytes) || 0) / divisor).toFixed(decimals)
  const prefix = bytes < 0 ? '-' : ''

  return `${prefix}${value} ${fileSizeUnits[unitIndex]}`
}
