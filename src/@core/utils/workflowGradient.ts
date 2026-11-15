import { actionStepDict } from '@/api/constants'

export interface WorkflowGradient {
  accentRgb: string
  startRgb: string
  endRgb: string
  backgroundImage: string
}

export interface WorkflowCardActionItem {
  data?: {
    label?: string
  }
  id?: number | string
  name?: string
  type?: string
}

export interface WorkflowCardFlowItem {
  source?: number | string
  target?: number | string
}

// 对齐 iOS 系统快捷指令（Shortcuts）色系的宝石饱和度调色板，兼顾浅色柔彩横幅与深色微光透射。
const workflowGradientPalettes = [
  ['10, 132, 255', '0, 102, 220'], // System Blue
  ['94, 92, 230', '72, 70, 204'], // System Indigo
  ['48, 176, 199', '18, 138, 168'], // System Teal
  ['50, 173, 132', '31, 138, 104'], // System Mint
  ['175, 82, 222', '137, 68, 198'], // System Purple
  ['255, 149, 0', '217, 119, 6'], // System Orange
  ['56, 152, 236', '37, 114, 201'], // System Sky
  ['52, 199, 89', '36, 158, 68'], // System Green
  ['255, 55, 95', '214, 38, 92'], // System Pink
  ['139, 92, 246', '109, 64, 214'], // System Violet
  ['255, 69, 58', '215, 44, 56'], // System Coral
  ['20, 184, 166', '13, 148, 136'], // System Cyan-Teal
] as const

const workflowActionIconMap: Record<string, string> = {
  AddDownloadAction: 'mdi-download-outline',
  AddSubscribeAction: 'mdi-star-plus-outline',
  FetchDownloadsAction: 'mdi-progress-download',
  FetchMediasAction: 'mdi-movie-search-outline',
  FetchRssAction: 'mdi-rss',
  FetchTorrentsAction: 'mdi-magnify',
  FilterMediasAction: 'mdi-filter-check-outline',
  FilterTorrentsAction: 'mdi-filter-variant',
  InvokePluginAction: 'mdi-puzzle-outline',
  NoteAction: 'mdi-note-text-outline',
  ScanFileAction: 'mdi-folder-search-outline',
  ScrapeFileAction: 'mdi-file-search-outline',
  SendEventAction: 'mdi-lightning-bolt-outline',
  SendMessageAction: 'mdi-bell-outline',
  TransferFileAction: 'mdi-folder-move-outline',
}

/**
 * 根据工作流标识稳定选择一组 iOS 系统色相，使我的工作流与分享卡片保持统一视觉识别。
 * @param seed 工作流标识；缺失时回退随机值保证卡片仍有可用色相。
 * @returns 主色与渐变两端的 RGB 通道及渐变声明。
 */
export function getWorkflowGradient(seed?: string | number | null): WorkflowGradient {
  const value = String(seed || Math.random())
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  const [startRgb, endRgb] = workflowGradientPalettes[Math.abs(hash) % workflowGradientPalettes.length]

  return {
    accentRgb: startRgb,
    startRgb,
    endRgb,
    backgroundImage: `linear-gradient(135deg, rgb(${startRgb}) 0%, rgb(${endRgb}) 100%)`,
  }
}

/**
 * 安全解析可能以 JSON 字符串或数组形式存储的工作流节点或连线列表。
 */
export function parseWorkflowJsonArray<T extends object>(raw: unknown): T[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is T => Boolean(item && typeof item === 'object'))
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is T => Boolean(item && typeof item === 'object'))
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Invalid workflow JSON payload:', error)
      }
      return []
    }
  }
  return []
}

function getActionKey(action: WorkflowCardActionItem, index: number): string {
  return action.id == null ? `action-${index}` : String(action.id)
}

/**
 * 按连线拓扑顺序排列工作流动作节点，便于在卡片上直观预览真实执行链路。
 */
export function orderWorkflowActions(actionsInput: unknown, flowsInput?: unknown): WorkflowCardActionItem[] {
  const actions = parseWorkflowJsonArray<WorkflowCardActionItem>(actionsInput)
  if (actions.length <= 1) return actions

  const flows = parseWorkflowJsonArray<WorkflowCardFlowItem>(flowsInput)
  if (flows.length === 0) return actions

  const records = actions.map((action, index) => ({ action, key: getActionKey(action, index) }))
  const actionById = new Map(records.map(({ action, key }) => [key, action]))
  const actionIndex = new Map(records.map(({ key }, index) => [key, index]))
  const indegree = new Map(records.map(({ key }) => [key, 0]))
  const targetsBySource = new Map<string, string[]>()

  for (const flow of flows) {
    const source = String(flow.source ?? '')
    const target = String(flow.target ?? '')
    if (!actionById.has(source) || !actionById.has(target) || source === target) continue

    const targets = targetsBySource.get(source) ?? []
    if (targets.includes(target)) continue

    targets.push(target)
    targetsBySource.set(source, targets)
    indegree.set(target, (indegree.get(target) ?? 0) + 1)
  }

  const queue = records.filter(({ key }) => (indegree.get(key) ?? 0) === 0).map(({ key }) => key)
  const ordered: WorkflowCardActionItem[] = []
  const visited = new Set<string>()

  while (queue.length > 0) {
    queue.sort((left, right) => (actionIndex.get(left) ?? 0) - (actionIndex.get(right) ?? 0))
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue

    visited.add(currentId)
    ordered.push(actionById.get(currentId)!)

    for (const targetId of targetsBySource.get(currentId) ?? []) {
      const nextDegree = (indegree.get(targetId) ?? 0) - 1
      indegree.set(targetId, nextDegree)
      if (nextDegree === 0) queue.push(targetId)
    }
  }

  for (const { action, key } of records) {
    if (!visited.has(key)) ordered.push(action)
  }

  return ordered
}

/**
 * 解析动作节点对应的图标名称（同时兼容 ScanFile 与 ScanFileAction 两种写法）。
 */
export function getWorkflowActionIcon(type?: string): string {
  if (!type) return 'mdi-cube-outline'
  const normalized = type.endsWith('Action') ? type : `${type}Action`
  return workflowActionIconMap[type] || workflowActionIconMap[normalized] || 'mdi-cube-outline'
}

const workflowActionStepI18nMap: Record<string, string> = {
  添加下载: 'actionStep.addDownload',
  添加订阅: 'actionStep.addSubscribe',
  获取下载任务: 'actionStep.fetchDownloads',
  获取媒体数据: 'actionStep.fetchMedias',
  获取RSS资源: 'actionStep.fetchRss',
  搜索站点资源: 'actionStep.fetchTorrents',
  过滤媒体数据: 'actionStep.filterMedias',
  过滤资源: 'actionStep.filterTorrents',
  扫描目录: 'actionStep.scanFile',
  刮削文件: 'actionStep.scrapeFile',
  发送事件: 'actionStep.sendEvent',
  发送消息: 'actionStep.sendMessage',
  整理文件: 'actionStep.transferFile',
  调用插件: 'actionStep.invokePlugin',
  备注: 'actionStep.note',
}

/**
 * 解析动作节点的简洁展示名称（优先使用组件级响应式 t 函数，避免模块初始化语言冻结）。
 */
export function getWorkflowActionLabel(
  action: WorkflowCardActionItem,
  fallback = '',
  translate?: (key: string) => string,
): string {
  const rawName = action.name || action.data?.label
  if (rawName) {
    const i18nKey = workflowActionStepI18nMap[rawName]
    if (i18nKey && translate) return translate(i18nKey)
    return actionStepDict[rawName] || rawName
  }
  if (action.type) return action.type.replace(/Action$/, '')
  return fallback
}
