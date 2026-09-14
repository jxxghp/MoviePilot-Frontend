export interface WorkflowGradient {
  startRgb: string
  endRgb: string
  backgroundImage: string
}

const workflowGradientPalettes = [
  ['74, 85, 104', '45, 55, 72'],
  ['85, 60, 154', '183, 148, 244'],
  ['44, 90, 160', '26, 54, 93'],
  ['47, 133, 90', '34, 84, 61'],
  ['197, 48, 48', '116, 42, 42'],
  ['214, 158, 46', '151, 90, 22'],
  ['128, 90, 213', '85, 60, 154'],
  ['49, 130, 206', '44, 82, 130'],
  ['56, 161, 105', '39, 103, 73'],
  ['229, 62, 62', '197, 48, 48'],
  ['221, 107, 32', '192, 86, 33'],
  ['107, 70, 193', '85, 60, 154'],
  ['43, 108, 176', '44, 82, 130'],
  ['56, 161, 105', '47, 133, 90'],
  ['213, 63, 140', '151, 38, 109'],
] as const

/**
 * 根据工作流标识稳定选择一组渐变色，让工作流卡片和分享卡片使用相同的视觉语言。
 * @param seed 工作流标识；缺失时使用随机值保证卡片仍有可用背景。
 * @returns 渐变两端的 RGB 通道和原始渐变声明。
 */
export function getWorkflowGradient(seed?: string | number | null): WorkflowGradient {
  const value = String(seed || Math.random())
  const hash = value.split('').reduce((accumulator, character) => {
    accumulator = (accumulator << 5) - accumulator + character.charCodeAt(0)
    return accumulator & accumulator
  }, 0)
  const [startRgb, endRgb] = workflowGradientPalettes[Math.abs(hash) % workflowGradientPalettes.length]

  return {
    startRgb,
    endRgb,
    backgroundImage: `linear-gradient(135deg, rgb(${startRgb}) 0%, rgb(${endRgb}) 100%)`,
  }
}
