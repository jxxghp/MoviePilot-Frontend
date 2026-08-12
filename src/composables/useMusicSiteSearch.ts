import api from '@/api'
import type { Site } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import type { RouteLocationRaw } from 'vue-router'

const SearchSiteDialog = defineAsyncComponent(() => import('@/components/dialog/SearchSiteDialog.vue'))

type MusicResourceRouteBuilder = (sites: number[]) => RouteLocationRaw | undefined

/**
 * 统一处理音乐资源搜索前的站点加载、选择与跳转。
 *
 * @param buildRoute 根据已选站点构造资源搜索路由
 */
export function useMusicSiteSearch(buildRoute: MusicResourceRouteBuilder) {
  const router = useRouter()
  const musicSites = ref<Site[]>([])
  const selectedSites = ref<number[]>([])
  let dialogController: ReturnType<typeof openSharedDialog> | undefined

  /** 查询已配置且支持音乐搜索的启用站点。 */
  async function queryMusicSites() {
    musicSites.value = []
    try {
      const sites: Site[] = await api.get('site/media/music')
      musicSites.value = sites.filter(site => site.is_active)
    } catch (error) {
      console.error(error)
    }
  }

  /** 查询用户默认选择的索引站点。 */
  async function querySelectedSites() {
    selectedSites.value = []
    try {
      const result = await api.get<{ value?: number[] }>('system/setting/public/IndexerSites')
      selectedSites.value = result.value ?? []
    } catch (error) {
      console.error(error)
    }
  }

  /** 重新加载音乐站点，并同步更新已打开对话框的属性。 */
  async function reloadMusicSites() {
    await queryMusicSites()
    dialogController?.updateProps({
      sites: musicSites.value,
      selected: selectedSites.value,
    })
  }

  /** 使用用户确认的站点进入音乐资源搜索页。 */
  function searchSelectedSites(sites: number[]) {
    if (!sites.length) return
    selectedSites.value = sites
    const target = buildRoute(sites)
    if (target) router.push(target)
  }

  /** 打开只包含音乐站点的站点选择对话框。 */
  function openMusicSiteDialog() {
    dialogController = openSharedDialog(
      SearchSiteDialog,
      {
        sites: musicSites.value,
        selected: selectedSites.value,
      },
      {
        reload: reloadMusicSites,
        search: searchSelectedSites,
      },
      { closeOn: ['close', 'search'] },
    )
  }

  /** 加载音乐站点和默认选择后打开站点选择对话框。 */
  async function openMusicSiteSearch() {
    await Promise.all([queryMusicSites(), querySelectedSites()])
    openMusicSiteDialog()
  }

  return { openMusicSiteSearch }
}
