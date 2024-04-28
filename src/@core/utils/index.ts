// 👉 IsEmpty
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '')
    return true

  return !!(Array.isArray(value) && value.length === 0)
}

// 👉 IsNullOrUndefined
export function isNullOrUndefined(value: unknown): value is undefined | null {
  return value === null || value === undefined
}

// 👉 IsEmptyArray
export function isEmptyArray(arr: unknown): boolean {
  return Array.isArray(arr) && arr.length === 0
}

// 👉 IsObject
export function isObject(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && !!obj && typeof obj === 'object' && !Array.isArray(obj)
}

export function isToday(date: Date) {
  const today = new Date()

  return (
    /* eslint-disable operator-linebreak */
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
    /* eslint-enable */
  )
}

/**
 * 计算时间差，返回xx天/xx小时/xx分钟/xx秒
 *
 * @deprecated 建议使用：@core/utils/formatters.ts formatDateDifference
 */
export function calculateTimeDifference(inputTime: string): string {
  if (!inputTime)
    return ''

  const inputDate = new Date(inputTime.replaceAll(/-/g, '/'))
  const currentDate = new Date()

  const timeDifference = currentDate.getTime() - inputDate.getTime()
  const secondsDifference = Math.floor(timeDifference / 1000)

  if (secondsDifference < 60) {
    return `${secondsDifference}秒`
  }
  else if (secondsDifference < 3600) {
    const minutes = Math.floor(secondsDifference / 60)

    return `${minutes}分钟`
  }
  else if (secondsDifference < 86400) {
    const hours = Math.floor(secondsDifference / 3600)

    return `${hours}小时`
  }
  else {
    const days = Math.floor(secondsDifference / 86400)

    return `${days}天`
  }
}

// 计算时间差，返回xx天xx小时xx分钟
export function calculateTimeDiff(inputTime: string): string {
  if (!inputTime)
    return ''

  // 使用当前时区
  const inputDate = new Date(inputTime.replaceAll(/-/g, '/'))
  const currentDate = new Date()

  const timeDifference = currentDate.getTime() - inputDate.getTime()
  const secondsDifference = Math.floor(timeDifference / 1000)

  const days = Math.floor(secondsDifference / 86400)
  const hours = Math.floor(secondsDifference % 86400 / 3600)
  const minutes = Math.floor(secondsDifference % 86400 % 3600 / 60)
  const secones = Math.floor(secondsDifference % 60)

  if (days > 0)
    return `${days}天${hours}小时${minutes}分钟`

  else if (hours > 0)
    return `${hours}小时${minutes}分钟`

  else if (minutes > 0)
    return `${minutes}分钟`

  else if (secones > 0)
    return `${secones}秒`

  return ''
}

// 判断一个数组subArray是不是在另一个数组mainArray中
export function isContained(subArray: any[], mainArray: any[]): boolean {
  return subArray.every(element => mainArray.includes(element))
}

// 判断两个数组是否存在交集
export function isIntersected(array1: any[], array2: any[]): boolean {
  return array1.some(element => array2.includes(element))
}

export function isNullOrEmptyObject(obj: any): boolean {
  // 首先判断是否为 null 或 undefined
  if (obj === null || obj === undefined)
    return true

  // 然后判断是否为空对象
  return !!(typeof obj === 'object' && Object.keys(obj).length === 0)
}

// 判断系统配置色是否是黑暗的
export function checkPrefersColorSchemeIsDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch (e) {
    return false
  }
}
