<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import draggable from 'vuedraggable'
import api from '@/api'
import FilterRuleCard from '@/components/cards/FilterRuleCard.vue'
import type { Site } from '@/api/types'
import { copyToClipboard } from '@/@core/utils/navigator'
import ImportCodeDialog from '@/components/dialog/ImportCodeDialog.vue'

// 规则卡片类型
interface FilterCard {
  // 优先级
  pri: string
  // 已选规则
  rules: string[]
}

// 提示框
const $toast = useToast()

// 订阅规则卡片列表
const subscribeFilterCards = ref<FilterCard[]>([])

// 洗版规则卡片列表
const bestVersionFilterCards = ref<FilterCard[]>([])

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedRssSites = ref<number[]>([])

// 当前规则类型
const currentRuleType = ref('SubscribeFilterRules')

// 是否开启订阅定时搜索
const enableIntervalSearch = ref(false)

// 包含与排除规则
const defaultFilterRules = ref({
  include: '',
  exclude: '',
  movie_size: '',
  tv_size: '',
  min_seeders: 0,
  min_seeders_time: 0,
})

// 订阅模式选择项
const subscribeModeItems = [
  { title: '自动', value: 'spider' },
  { title: '站点RSS', value: 'rss' },
]

// 选择的订阅模式
const selectedSubscribeMode = ref('spider')

// RSS运行周期选择项
const rssIntervalItems = [
  { title: '5分钟', value: 5 },
  { title: '10分钟', value: 10 },
  { title: '20分钟', value: 20 },
  { title: '半小时', value: 30 },
  { title: '1小时', value: 60 },
  { title: '12小时', value: 720 },
  { title: '1天', value: 1440 },
]

// 选择的RSS运行周期
const selectedRssInterval = ref<number>(5)

// 导入代码弹窗
const importCodeDialog = ref(false)

// 导入的代码
const importCodeString = ref('')

// 查询用户选中的订阅站点
async function querySelectedRssSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/RssSites')

    selectedRssSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存用户选中的订阅站点
async function saveSelectedRssSites() {
  try {
    const result1: { [key: string]: any } = await api.post('system/setting/RssSites', selectedRssSites.value)

    const result2: { [key: string]: any } = await api.post(
      'system/setting/SUBSCRIBE_SEARCH',
      enableIntervalSearch.value ? 'True' : 'False',
    )

    const result3: { [key: string]: any } = await api.post('system/setting/SUBSCRIBE_MODE', selectedSubscribeMode.value)

    const result4: { [key: string]: any } = await api.post(
      'system/setting/SUBSCRIBE_RSS_INTERVAL',
      selectedRssInterval.value,
    )

    if (result1.success && result2.success && result3.success && result4.success) $toast.success('订阅站点保存成功')
    else $toast.error('订阅站点保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
    querySelectedRssSites()

    // 查询订阅搜索开关
    const result: { [key: string]: any } = await api.get('system/setting/SUBSCRIBE_SEARCH')
    if (result.success) enableIntervalSearch.value = result.data?.value
    // 查询订阅模式
    const result2: { [key: string]: any } = await api.get('system/setting/SUBSCRIBE_MODE')
    if (result2.success) selectedSubscribeMode.value = result2.data?.value
    // 查询站点RSS周期
    const result3: { [key: string]: any } = await api.get('system/setting/SUBSCRIBE_RSS_INTERVAL')
    if (result3.success) selectedRssInterval.value = result3.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 查询已设置优先级规则
async function queryCustomFilters(ruleType: string) {
  try {
    const result: { [key: string]: any } = await api.get(`system/setting/${ruleType}`)
    if (result.success) {
      // 保存的是个字符串，需要分割成数组
      const groups = result.data?.value?.split('>') ?? []

      // 生成规则卡片
      const cards = ruleType === 'SubscribeFilterRules' ? subscribeFilterCards : bestVersionFilterCards
      cards.value = groups?.map((group: string, index: number) => {
        return {
          pri: (index + 1).toString(),
          rules: group.split('&'),
        }
      })
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存用户设置的规则
async function saveCustomFilters(ruleType: string) {
  try {
    // 有值才处理
    let value = ''
    const cards = ruleType === 'SubscribeFilterRules' ? subscribeFilterCards : bestVersionFilterCards
    if (cards.value.length !== 0) {
      // 将卡片规则接装为字符串
      value = cards.value
        .filter(card => card.rules.length > 0)
        .map(card => card.rules.join('&'))
        .join('>')
    }
    // 保存
    const result: { [key: string]: any } = await api.post(`system/setting/${ruleType}`, value)

    const msg = ruleType === 'SubscribeFilterRules' ? '订阅优先级' : '洗版优先级'

    if (result.success) $toast.success(`${msg}保存成功`)
    else $toast.error(`${msg}保存失败！`)
  } catch (error) {
    console.log(error)
  }
}

// 更新规则卡片的值
function updateSubscribeFilterCardValue(pri: string, rules: string[]) {
  const card = subscribeFilterCards.value.find(card => card.pri === pri)
  if (card) card.rules = rules
}

// 更新洗版规则卡片的值
function updateBestVersionFilterCardValue(pri: string, rules: string[]) {
  const card = bestVersionFilterCards.value.find(card => card.pri === pri)
  if (card) card.rules = rules
}

// 移除卡片
function filterCardClose(ruleType: string, pri: string) {
  // 将pri对应的卡片从列表中删除，并更新剩余卡片的序号
  const updatedCards = (ruleType === 'SubscribeFilterRules' ? subscribeFilterCards.value : bestVersionFilterCards.value)
    .filter(card => card.pri !== pri)
    .map((card, index) => {
      card.pri = (index + 1).toString()
      return card
    })
  // 更新 subscribeFilterCards.value
  if (ruleType === 'SubscribeFilterRules') subscribeFilterCards.value = updatedCards
  else bestVersionFilterCards.value = updatedCards
}

// 增加卡片
function addFilterCard(ruleType: string) {
  const cards = ruleType === 'SubscribeFilterRules' ? subscribeFilterCards : bestVersionFilterCards
  // 优先级
  const pri = (cards.value.length + 1).toString()

  // 新卡片
  const newCard: FilterCard = { pri, rules: [] }

  // 添加到列表
  cards.value.push(newCard)
}

// 根据列表的拖动顺序更新优先级
function dragOrderEnd(ruleType: string) {
  ;(ruleType === 'SubscribeFilterRules' ? subscribeFilterCards.value : bestVersionFilterCards.value).map(
    (card, index) => {
      card.pri = (index + 1).toString()
      return card
    },
  )
}

// 查询包含与排除规则
async function queryDefaultFilter() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/DefaultFilterRules')
    if (result.data?.value) defaultFilterRules.value = result.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 保存包含与排除规则
async function saveDefaultFilter() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/DefaultFilterRules', defaultFilterRules.value)
    if (result.success) $toast.success('默认包含/排除规则保存成功')
    else $toast.error('默认包含/排除规则保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 分享规则
function shareRules(ruleType: string) {
  let filterCards: Ref<FilterCard[]>
  if (ruleType === 'SubscribeFilterRules') filterCards = subscribeFilterCards
  else filterCards = bestVersionFilterCards
  // 有值才处理
  if (filterCards.value.length === 0) return

  // 将卡片规则接装为字符串
  const value = filterCards.value
    .filter(card => card.rules.length > 0)
    .map(card => card.rules.join('&'))
    .join('>')

  // 复制到剪贴板
  try {
    copyToClipboard(value)
    $toast.success('优先级规则已复制到剪贴板')
  } catch (error) {
    $toast.error('优先级规则复制失败！')
  }
}

// 导入规则
async function importRules(ruleType: string) {
  currentRuleType.value = ruleType
  importCodeString.value = ''
  importCodeDialog.value = true
}

// 监听导入代码变化
watchEffect(() => {
  if (!importCodeString.value) return
  if (!currentRuleType.value) return
  // 导入代码需要以空格开头和结束，没有则拼接
  if (!importCodeString.value.startsWith(' ')) importCodeString.value = ` ${importCodeString.value}`
  if (!importCodeString.value.endsWith(' ')) importCodeString.value = `${importCodeString.value} `
  let filterCards: Ref<FilterCard[]>
  if (currentRuleType.value === 'SubscribeFilterRules') filterCards = subscribeFilterCards
  else filterCards = bestVersionFilterCards
  // 将导入的代码转换为规则卡片
  const groups = importCodeString.value.split('>')
  filterCards.value = groups.map((group: string, index: number) => {
    return {
      pri: (index + 1).toString(),
      rules: group.split('&'),
    }
  })
})

onMounted(() => {
  querySites()
  queryCustomFilters('SubscribeFilterRules')
  queryCustomFilters('BestVersionFilterRules')
  queryDefaultFilter()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>订阅站点</VCardTitle>
          <VCardSubtitle>只有选中的站点才会在订阅中使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VChipGroup v-model="selectedRssSites" column multiple>
            <VChip
              v-for="site in allSites"
              :key="site.id"
              :color="selectedRssSites.includes(site.id) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="site.id"
            >
              {{ site.name }}
            </VChip>
          </VChipGroup>
        </VCardText>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedSubscribeMode"
                  :items="subscribeModeItems"
                  label="订阅模式"
                  hint="自动：自动爬取站点首页，站点RSS：通过站点RSS链接订阅"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedRssInterval"
                  :items="rssIntervalItems"
                  label="站点RSS周期"
                  hint="设置站点RSS运行周期，在订阅模式为`站点RSS`时生效"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="enableIntervalSearch"
                  label="开启订阅定时搜索"
                  hint="每隔24小时全站搜索，以补全订阅可能漏掉的资源"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveSelectedRssSites"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <template #append>
            <IconBtn>
              <VIcon icon="mdi-dots-vertical" />
              <VMenu activator="parent" close-on-content-click>
                <VList>
                  <VListItem variant="plain" @click="shareRules('SubscribeFilterRules')">
                    <template #prepend>
                      <VIcon icon="mdi-share" />
                    </template>
                    <VListItemTitle>分享</VListItemTitle>
                  </VListItem>
                  <VListItem variant="plain" @click="importRules('SubscribeFilterRules')">
                    <template #prepend>
                      <VIcon icon="mdi-import" />
                    </template>
                    <VListItemTitle>导入</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </IconBtn>
          </template>
          <VCardTitle>订阅优先级</VCardTitle>
          <VCardSubtitle> 设置在正常订阅时默认使用的优先级，未在优先级中的资源将不会自动下载。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="subscribeFilterCards"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="dragOrderEnd('SubscribeFilterRules')"
            :component-data="{ 'class': 'grid gap-3 grid-filterrule-card' }"
          >
            <template #item="{ element }">
              <FilterRuleCard
                :pri="element.pri"
                :maxpri="subscribeFilterCards.length.toString()"
                :rules="element.rules"
                @changed="updateSubscribeFilterCardValue"
                @close="filterCardClose('SubscribeFilterRules', element.pri)"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveCustomFilters('SubscribeFilterRules')"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addFilterCard('SubscribeFilterRules')">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>洗版优先级</VCardTitle>
          <template #append>
            <IconBtn>
              <VIcon icon="mdi-dots-vertical" />
              <VMenu activator="parent" close-on-content-click>
                <VList>
                  <VListItem variant="plain" @click="shareRules('BestVersionFilterRules')">
                    <template #prepend>
                      <VIcon icon="mdi-share" />
                    </template>
                    <VListItemTitle>分享</VListItemTitle>
                  </VListItem>
                  <VListItem variant="plain" @click="importRules('BestVersionFilterRules')">
                    <template #prepend>
                      <VIcon icon="mdi-import" />
                    </template>
                    <VListItemTitle>导入</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </IconBtn>
          </template>
          <VCardSubtitle> 设置在订阅洗版时使用的优先级，匹配优先级1时洗版完成。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="bestVersionFilterCards"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="dragOrderEnd('BestVersionFilterRules')"
            :component-data="{ 'class': 'grid gap-3 grid-filterrule-card' }"
          >
            <template #item="{ element }">
              <FilterRuleCard
                :pri="element.pri"
                :maxpri="bestVersionFilterCards.length.toString()"
                :rules="element.rules"
                @changed="updateBestVersionFilterCardValue"
                @close="filterCardClose('BestVersionFilterRules', element.pri)"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveCustomFilters('BestVersionFilterRules')"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addFilterCard('BestVersionFilterRules')">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>默认过滤规则</VCardTitle>
          <VCardSubtitle> 设置在订阅时默认使用的过滤规则。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.include"
                  type="text"
                  label="包含（关键字、正则式）"
                  hint="包含规则，支持正式表达式，多个关键字用 | 分隔表示或"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.exclude"
                  type="text"
                  label="排除（关键字、正则式）"
                  hint="排除规则，支持正式表达式，多个关键字用 | 分隔表示或"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.movie_size"
                  type="text"
                  label="电影文件大小（GB）"
                  placeholder="0-30"
                  hint="文件大小范围，格式：0-30，表示0-30GB之间的资源"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.tv_size"
                  type="text"
                  label="剧集单集文件大小（GB）"
                  placeholder="0-10"
                  hint="单集文件大小范围，格式：0-10，表示0-10GB之间的资源"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.min_seeders"
                  type="text"
                  label="最小做种数"
                  placeholder="0"
                  hint="小于该值的资源将被过滤掉，0表示不过滤"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.min_seeders_time"
                  type="text"
                  label="最少做种数生效发布时间（分钟）"
                  placeholder="0"
                  hint="发布时间距当前时间大于该值的资源将生效最小做种数规则，0表示不生效"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveDefaultFilter"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VDialog v-model="importCodeDialog" width="60rem" scrollable>
    <ImportCodeDialog v-model="importCodeString" title="导入优先级规则" @close="importCodeDialog = false" />
  </VDialog>
</template>
