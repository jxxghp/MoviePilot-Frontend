<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import FilterRuleCard from '@/components/cards/FilterRuleCard.vue'
import type { Site } from '@/api/types'

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
  }
  catch (error) {
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
    const result: { [key: string]: any } = await api.post(
      'system/setting/SearchFilterRules',
      value,
    )

    if (result.success)
      $toast.success('搜索优先级保存成功')
    else
      $toast.error('搜索优先级保存失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 更新规则卡片的值
function updateFilterCardValue(pri: string, rules: string[]) {
  const card = filterCards.value.find(card => card.pri === pri)
  if (card)
    card.rules = rules
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
  }
  catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/IndexerSites')

    selectedSites.value = result.data?.value ?? []
  }
  catch (error) {
    console.log(error)
  }
}

// 保存用户选中的站点
async function saveSelectedSites() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post('system/setting/IndexerSites', selectedSites.value)

    if (result.success)
      $toast.success('搜索站点保存成功')
    else
      $toast.error('搜索站点保存失败！')
  }
  catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  queryCustomFilters()
  querySites()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="搜索站点">
        <VCardSubtitle> 只有选中的站点才会在搜索中使用。</VCardSubtitle>

        <VCardItem>
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
        </VCardItem>

        <VCardItem>
          <VBtn type="submit" @click="saveSelectedSites">
            保存
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="搜索优先级">
        <VCardSubtitle> 设置在搜索时默认使用的优先级排序，未在优先级中的资源将不在搜索结果中显示。 </VCardSubtitle>
        <VCardItem>
          <div class="grid gap-3 grid-filterrule-card">
            <FilterRuleCard
              v-for="(card, index) in filterCards"
              :key="index"
              :pri="card.pri"
              :rules="card.rules"
              @changed="updateFilterCardValue"
              @close="filterCardClose(card.pri)"
            />
          </div>
        </VCardItem>
        <VCardItem>
          <VBtn
            type="submit"
            class="me-2"
            @click="saveCustomFilters()"
          >
            保存
          </VBtn>
          <VBtn
            color="success"
            variant="tonal"
            @click="addFilterCard()"
          >
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
  </VRow>
</template>

<style lang="scss">
.grid-filterrule-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
