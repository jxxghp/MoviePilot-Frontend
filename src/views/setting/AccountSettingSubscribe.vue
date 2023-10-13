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

// 订阅规则卡片列表
const subscribeFilterCards = ref<FilterCard[]>([])

// 洗版规则卡片列表
const bestVersionFilterCards = ref<FilterCard[]>([])

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedRssSites = ref<number[]>([])

// 包含与排除规则
const defaultFilterRules = ref({
  include: '',
  exclude: '',
})

// 查询用户选中的订阅站点
async function querySelectedRssSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/RssSites')

    selectedRssSites.value = result.data?.value ?? []
  }
  catch (error) {
    console.log(error)
  }
}

// 保存用户选中的订阅站点
async function saveSelectedRssSites() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/RssSites', selectedRssSites.value)

    if (result.success)
      $toast.success('订阅站点保存成功')
    else
      $toast.error('订阅站点保存失败！')
  }
  catch (error) {
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
  }
  catch (error) {
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
  }
  catch (error) {
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
    const result: { [key: string]: any } = await api.post(
      `system/setting/${ruleType}`,
      value,
    )

    const msg = ruleType === 'SubscribeFilterRules' ? '订阅优先级' : '洗版优先级'

    if (result.success)
      $toast.success(`${msg}保存成功`)
    else
      $toast.error(`${msg}保存失败！`)
  }
  catch (error) {
    console.log(error)
  }
}

// 更新规则卡片的值
function updateFilterCardValue(pri: string, rules: string[]) {
  const card = subscribeFilterCards.value.find(card => card.pri === pri)
  if (card)
    card.rules = rules
}

// 更新洗版规则卡片的值
function updateFilterCardValue2(pri: string, rules: string[]) {
  const card = bestVersionFilterCards.value.find(card => card.pri === pri)
  if (card)
    card.rules = rules
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
  if (ruleType === 'SubscribeFilterRules')
    subscribeFilterCards.value = updatedCards
  else
    bestVersionFilterCards.value = updatedCards
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

// 上调优先级
function onLevelUp(filterCards: FilterCard[], pri: string) {
  // 找到当前卡片
  const card = filterCards.find(card => card.pri === pri)
  if (!card)
    return

  // 找到当前卡片的上一张卡片
  const prevCard = filterCards.find(card => card.pri === (parseInt(pri) - 1).toString())
  if (!prevCard)
    return

  // 交换两张卡片的优先级
  const temp = card.pri
  card.pri = prevCard.pri
  prevCard.pri = temp

  // 卡片重新按优先级排序
  filterCards.sort((a, b) => parseInt(a.pri) - parseInt(b.pri))
}

// 下调优先级
function onLevelDown(filterCards: FilterCard[], pri: string) {
  // 找到当前卡片
  const card = filterCards.find(card => card.pri === pri)
  if (!card)
    return

  // 找到当前卡片的下一张卡片
  const nextCard = filterCards.find(card => card.pri === (parseInt(pri) + 1).toString())
  if (!nextCard)
    return

  // 交换两张卡片的优先级
  const temp = card.pri
  card.pri = nextCard.pri
  nextCard.pri = temp

  // 卡片重新按优先级排序
  filterCards.sort((a, b) => parseInt(a.pri) - parseInt(b.pri))
}

// 查询包含与排除规则
async function queryDefaultFilter() {
  try {
    const result: { [key: string]: any } = await api.get(
      'system/setting/DefaultFilterRules',
    )
    if (result.data?.value)
      defaultFilterRules.value = result.data?.value
  }
  catch (error) {
    console.log(error)
  }
}

// 保存包含与排除规则
async function saveDefaultFilter() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/DefaultFilterRules',
      defaultFilterRules.value,
    )
    if (result.success)
      $toast.success('默认包含/排除规则保存成功')
    else
      $toast.error('默认包含/排除规则保存失败！')
  }
  catch (error) {
    console.log(error)
  }
}

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
      <VCard title="订阅站点">
        <VCardSubtitle> 只有选中的站点才会在订阅中使用。</VCardSubtitle>

        <VCardItem>
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
        </VCardItem>

        <VCardItem>
          <VBtn type="submit" @click="saveSelectedRssSites">
            保存
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="订阅优先级">
        <VCardSubtitle> 设置在正常订阅时默认使用的优先级，未在优先级中的资源将不会自动下载。 </VCardSubtitle>
        <VCardItem>
          <div class="grid gap-3 grid-filterrule-card">
            <FilterRuleCard
              v-for="(card, index) in subscribeFilterCards"
              :key="index"
              :pri="card.pri"
              :maxpri="subscribeFilterCards.length.toString()"
              :rules="card.rules"
              @changed="updateFilterCardValue"
              @close="filterCardClose('SubscribeFilterRules', card.pri)"
              @leveldown="onLevelDown(subscribeFilterCards, card.pri)"
              @levelup="onLevelUp(subscribeFilterCards, card.pri)"
            />
          </div>
        </VCardItem>
        <VCardItem>
          <VBtn
            type="submit"
            class="me-2"
            @click="saveCustomFilters('SubscribeFilterRules')"
          >
            保存
          </VBtn>
          <VBtn
            color="success"
            variant="tonal"
            @click="addFilterCard('SubscribeFilterRules')"
          >
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="洗版优先级">
        <VCardSubtitle> 设置在订阅洗版时使用的优先级，匹配优先级1时洗版完成。 </VCardSubtitle>
        <VCardItem>
          <div class="grid gap-3 grid-filterrule-card">
            <FilterRuleCard
              v-for="(card, index) in bestVersionFilterCards"
              :key="index"
              :pri="card.pri"
              :maxpri="bestVersionFilterCards.length.toString()"
              :rules="card.rules"
              @changed="updateFilterCardValue2"
              @close="filterCardClose('BestVersionFilterRules', card.pri)"
              @leveldown="onLevelDown(bestVersionFilterCards, card.pri)"
              @levelup="onLevelUp(bestVersionFilterCards, card.pri)"
            />
          </div>
        </VCardItem>
        <VCardItem>
          <VBtn
            type="submit"
            class="me-2"
            @click="saveCustomFilters('BestVersionFilterRules')"
          >
            保存
          </VBtn>
          <VBtn
            color="success"
            variant="tonal"
            @click="addFilterCard('BestVersionFilterRules')"
          >
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="默认过滤规则">
        <VCardSubtitle> 设置在订阅时默认使用的过滤规则。 </VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.include"
                  type="text"
                  label="包含（关键字、正则式）"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="defaultFilterRules.exclude"
                  type="text"
                  label="排除（关键字、正则式）"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardItem>
          <VBtn
            type="submit"
            @click="saveDefaultFilter"
          >
            保存
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
