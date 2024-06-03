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

// 规则卡片列表
const filterCards = ref<FilterCard[]>([])

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedSites = ref<number[]>([])

// 包含与排除规则
const defaultFilterRules = ref({
  include: '',
  exclude: '',
  min_seeders: 0,
  min_seeders_time: 0,
})

// 媒体信息数据源字典
const mediaSourcesDict = [
  {
    title: 'TheMovieDb',
    value: 'themoviedb',
  },
  {
    title: '豆瓣',
    value: 'douban',
  },
  {
    title: 'Bangumi',
    value: 'bangumi',
  },
]

// 当前选中的媒体信息数据源
const selectedMediaSource = ref([])

// 导入代码弹窗
const importCodeDialog = ref(false)

// 导入的代码
const importCodeString = ref('')

// 查询已设置优先级规则
async function queryCustomFilters() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/SearchFilterRules')
    if (result.success) {
      // 保存的是个字符串，需要分割成数组
      const groups = result.data?.value?.split('>') ?? []

      // 生成规则卡片
      filterCards.value = groups?.map((group: string, index: number) => {
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
async function saveCustomFilters() {
  try {
    // 有值才处理
    let value = ''
    if (filterCards.value.length !== 0) {
      // 将卡片规则接装为字符串
      value = filterCards.value
        .filter(card => card.rules.length > 0)
        .map(card => card.rules.join('&'))
        .join('>')
    }
    // 保存
    const result: { [key: string]: any } = await api.post('system/setting/SearchFilterRules', value)

    if (result.success) $toast.success('搜索优先级保存成功')
    else $toast.error('搜索优先级保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 更新规则卡片的值
function updateFilterCardValue(pri: string, rules: string[]) {
  const card = filterCards.value.find(card => card.pri === pri)
  if (card) card.rules = rules
}

// 移除卡片
function filterCardClose(pri: string) {
  // 将pri对应的卡片从列表中删除，并更新剩余卡片的序号
  const updatedCards = filterCards.value
    .filter(card => card.pri !== pri)
    .map((card, index) => {
      card.pri = (index + 1).toString()
      return card
    })
  // 更新 filterCards.value
  filterCards.value = updatedCards
}

// 增加卡片
function addFilterCard() {
  // 优先级
  const pri = (filterCards.value.length + 1).toString()

  // 新卡片
  const newCard: FilterCard = { pri, rules: [] }

  // 添加到列表
  filterCards.value.push(newCard)
}

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
    querySelectedSites()
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/IndexerSites')

    selectedSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存用户选中的站点
async function saveSelectedSites() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post('system/setting/IndexerSites', selectedSites.value)

    if (result.success) $toast.success('搜索站点保存成功')
    else $toast.error('搜索站点保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 根据列表的拖动顺序更新优先级
function dragOrderEnd() {
  filterCards.value = filterCards.value.map((card, index) => {
    card.pri = (index + 1).toString()
    return card
  })
}

// 查询包含与排除规则
async function queryDefaultFilter() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/DefaultSearchFilterRules')
    if (result.data?.value) defaultFilterRules.value = result.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 保存包含与排除规则
async function saveDefaultFilter() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/DefaultSearchFilterRules',
      defaultFilterRules.value,
    )
    if (result.success) $toast.success('默认包含/排除规则保存成功')
    else $toast.error('默认包含/排除规则保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 分享规则
function shareRules() {
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

// 监听导入代码变化
watchEffect(() => {
  if (!importCodeString.value) return

  // 导入代码需要以空格开头和结束，没有则拼接
  if (!importCodeString.value.startsWith(' ')) importCodeString.value = ` ${importCodeString.value}`
  if (!importCodeString.value.endsWith(' ')) importCodeString.value = `${importCodeString.value} `

  // 将导入的代码转换为规则卡片
  const groups = importCodeString.value.split('>')
  filterCards.value = groups.map((group: string, index: number) => {
    return {
      pri: (index + 1).toString(),
      rules: group.split('&'),
    }
  })
})

// 调用API查询下载器设置
async function loadMediaSourceSetting() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/SEARCH_SOURCE')
    if (result1.success) selectedMediaSource.value = result1.data?.value?.split(',')
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存下载器设置
async function saveMediaSourceSetting() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/SEARCH_SOURCE',
      selectedMediaSource.value.join(','),
    )

    if (result.success) {
      $toast.success('保存媒体数据源设置成功')
    } else {
      $toast.error('保存媒体数据源设置失败！')
    }
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  queryCustomFilters()
  querySites()
  queryDefaultFilter()
  loadMediaSourceSetting()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>媒体数据源</VCardTitle>
          <VCardSubtitle>设定搜索时展示哪些源的媒体信息。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedMediaSource"
                multiple
                chips
                :items="mediaSourcesDict"
                label="当前使用数据源"
                hint="搜索媒体信息时使用的数据源以及排序"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveMediaSourceSetting"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>搜索站点</VCardTitle>
          <VCardSubtitle> 只有选中的站点才会在搜索中使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VChipGroup v-model="selectedSites" column multiple>
            <VChip
              v-for="site in allSites"
              :key="site.id"
              :color="selectedSites.includes(site.id) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="site.id"
            >
              {{ site.name }}
            </VChip>
          </VChipGroup>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveSelectedSites"> 保存 </VBtn>
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
                  <VListItem variant="plain" @click="shareRules">
                    <template #prepend>
                      <VIcon icon="mdi-share" />
                    </template>
                    <VListItemTitle>分享</VListItemTitle>
                  </VListItem>
                  <VListItem variant="plain" @click="importCodeDialog = true">
                    <template #prepend>
                      <VIcon icon="mdi-import" />
                    </template>
                    <VListItemTitle>导入</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </IconBtn>
          </template>
          <VCardTitle>搜索优先级</VCardTitle>
          <VCardSubtitle>设置在搜索时默认使用的优先级排序，未在优先级中的资源将不在搜索结果中显示。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="filterCards"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="dragOrderEnd"
            :component-data="{ 'class': 'grid gap-3 grid-filterrule-card' }"
          >
            <template #item="{ element }">
              <FilterRuleCard
                :pri="element.pri"
                :maxpri="filterCards.length.toString()"
                :rules="element.rules"
                @changed="updateFilterCardValue"
                @close="filterCardClose(element.pri)"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveCustomFilters()"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addFilterCard()">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>默认过滤规则</VCardTitle>
          <VCardSubtitle>设置在搜索时默认使用的过滤规则。</VCardSubtitle>
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
