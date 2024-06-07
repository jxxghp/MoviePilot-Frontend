// 👉 IsEmpty
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true

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
  if (obj === null || obj === undefined) return true

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

// 从URL中获取参数值
export function getQueryValue(key: string, url = window.location.href): string {
  const reg = new RegExp(`[?&]${key}=([^&#]*)`, 'i')
  const res = reg.exec(url)
  return res ? res[1] : ''
}
