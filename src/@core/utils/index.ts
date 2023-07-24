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

// 计算时间差，返回xx天xx小时xx分钟
export function calculateTimeDifference(inputTime: string): string {
  if (!inputTime)
    return ''

  const inputDate = new Date(inputTime)
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
