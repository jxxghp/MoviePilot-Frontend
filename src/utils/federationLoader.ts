import api from '@/api'
import { getFederationRemote, setFederationRemote, unwrapFederationDefault } from '@/utils/federationRuntime'
import { resolveFederationRemoteUrl } from '@/utils/federationUrl'

// 创建一个专用的AbortController，用于federationLoader请求
const federationController = new AbortController()

// 同一 remote 的首次加载共享发现与注册，避免并发写入同一个运行时槽位。
const remoteRegistrationFlights = new Map<string, Promise<boolean>>()

// 定义远程模块接口
export interface RemoteModule {
  id: string
  url: string
  name?: string
}

/**
 * 获取单个远程模块信息
 * @param id 远程模块ID
 */
async function fetchSingleRemoteModule(id: string): Promise<RemoteModule | null> {
  try {
    const modules = await fetchRemoteModules()
    return modules.find(module => module.id === id) || null
  } catch (error) {
    console.error(`获取远程模块信息失败: ${id}`, error)
    return null
  }
}

/** 发现并注册尚不可用的远程模块，同一 remote 同时只执行一次。 */
async function discoverAndRegisterRemote(id: string): Promise<boolean> {
  const activeFlight = remoteRegistrationFlights.get(id)
  if (activeFlight) return activeFlight

  const flight = (async () => {
    const moduleInfo = await fetchSingleRemoteModule(id)
    if (!moduleInfo) return false

    console.log(`组件未注册，正在重新注册: ${id}`)
    injectRemoteModule(moduleInfo)
    return true
  })()

  remoteRegistrationFlights.set(id, flight)
  try {
    return await flight
  } finally {
    if (remoteRegistrationFlights.get(id) === flight) {
      remoteRegistrationFlights.delete(id)
    }
  }
}

/**
 * 将 nav_key 转为联邦暴露名的 Pascal 片段（如 settings -> Settings，my-tool -> MyTool）
 */
function navKeyToPascalSegment(navKey: string): string {
  return navKey
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

/**
 * 加载插件全页组件（支持同一插件多界面）。
 *
 * 解析顺序（nav_key 为 main 或空时）：
 *   `AppPage` → `Page`
 *
 * 其它 nav_key（例如 settings、my_tool）：
 *   `AppPage{Pascal}` → `AppPage` → `Page`
 *   例：nav_key=settings → 尝试 `AppPageSettings`，再回退 `AppPage`、`Page`
 *
 * 也可在单个 `AppPage.vue` 内根据 `navKey` prop 分支渲染，无需多文件。
 */
export async function loadRemoteAppPageComponent(id: string, navKey: string = 'main') {
  const raw = (navKey || 'main').trim()
  const isMain = raw === '' || raw.toLowerCase() === 'main'

  const candidateNames: string[] = []
  if (isMain) {
    candidateNames.push('AppPage', 'Page')
  } else {
    const pascal = navKeyToPascalSegment(raw)
    if (pascal) {
      candidateNames.push(`AppPage${pascal}`)
    }
    candidateNames.push('AppPage', 'Page')
  }

  let lastError: unknown
  for (const name of candidateNames) {
    try {
      return await loadRemoteComponent(id, name)
    } catch (error) {
      lastError = error
      console.debug(`[federation] 插件 ${id} 全页尝试 ./${name} 失败，回退下一候选`)
    }
  }
  console.warn(`[federation] 插件 ${id} 全页均加载失败 (navKey=${raw})`, lastError)
  throw lastError ?? new Error(`无法加载插件 ${id} 的全页组件`)
}

/**
 * 加载远程组件
 * @param id 远程模块ID
 * @param componentName 组件名称 (如 'Page')
 */
export async function loadRemoteComponent(id: string, componentName: string = 'Page') {
  try {
    const module = await getFederationRemote(id, `./${componentName}`)
    return unwrapFederationDefault(module)
  } catch {
    // 组件未注册，尝试重新注册
    try {
      if (await discoverAndRegisterRemote(id)) {
        // 重新尝试加载组件
        const module = await getFederationRemote(id, `./${componentName}`)
        return unwrapFederationDefault(module)
      } else {
        console.error(`无法找到远程模块信息: ${id}`)
        throw new Error(`无法找到远程模块信息: ${id}`)
      }
    } catch (retryError) {
      console.error(`重新注册并加载组件失败: ${id}/${componentName}`, retryError)
      throw retryError
    }
  }
}

/**
 * 使用后端发现接口返回的 remote 信息加载指定组件。
 * @param remoteModule 远程模块信息
 * @param componentName 组件名称
 */
export async function loadRemoteComponentFromModule(remoteModule: RemoteModule, componentName: string = 'Page') {
  injectRemoteModule(remoteModule)
  const module = await getFederationRemote(remoteModule.id, `./${componentName}`)
  return unwrapFederationDefault(module)
}

/**
 * 从API获取远程模块列表
 */
async function fetchRemoteModules(): Promise<RemoteModule[]> {
  try {
    const response = (await api.get('plugin/remotes?token=moviepilot', {
      signal: federationController.signal,
    })) as unknown as RemoteModule[] | null
    return response ?? []
  } catch (error) {
    console.error('获取远程模块列表失败:', error)
    return []
  }
}

/**
 * 动态注入Federation Remote模块
 * @param modules 远程模块列表
 */
export function injectRemoteModule(module: RemoteModule): void {
  const remoteEntryUrl = resolveFederationRemoteUrl(module.url, import.meta.env.VITE_API_BASE_URL, document.baseURI)
  setFederationRemote(module.id, {
    url: () => Promise.resolve(remoteEntryUrl),
    format: 'esm',
    from: 'vite',
  })
  console.log('已注入远程模块:', module)
}

/**
 * 初始化并加载所有远程组件
 */
export async function loadRemoteComponents(): Promise<void> {
  try {
    // 获取远程模块列表
    const modules = await fetchRemoteModules()

    // 确保有模块才注入
    if (modules && modules.length > 0) {
      // 注入远程模块
      modules.forEach(module => {
        injectRemoteModule(module)
      })
    } else {
      console.log('没有发现可用的远程模块')
    }
  } catch (error) {
    console.error('加载远程组件失败:', error)
  }
}
