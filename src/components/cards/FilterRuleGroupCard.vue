<script lang="ts" setup>
import draggable from 'vuedraggable'
import { copyToClipboard } from '@/@core/utils/navigator'
import { CustomRule, FilterRuleGroup } from '@/api/types'
import FilterRuleCard from '@/components/cards/FilterRuleCard.vue'
import { useToast } from 'vue-toast-notification'
import ImportCodeDialog from '@/components/dialog/ImportCodeDialog.vue'
import filter_group_svg from '@images/svg/filter-group.svg'
import { cloneDeep } from 'lodash'

// 输入参数
const props = defineProps({
  // 单个规则组
  group: {
    type: Object as PropType<FilterRuleGroup>,
    required: true,
  },
  // 所有规则组
  groups: {
    type: Array as PropType<FilterRuleGroup[]>,
    required: true,
  },
  // 媒体类型字典
  categories: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
  // 自定义规则列表
  custom_rules: Array as PropType<CustomRule[]>,
})

// 规则卡片类型
interface FilterCard {
  // 优先级
  pri: string
  // 已选规则
  rules: string[]
}

// 提示框
const $toast = useToast()

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change', 'done'])

// 规则详情弹窗
const groupInfoDialog = ref(false)

// 规则详情
const groupInfo = ref<FilterRuleGroup>({
  name: props.group?.name ?? '',
  rule_string: props.group?.rule_string ?? '',
  media_type: props.group?.media_type ?? '',
  category: props.group?.category ?? '',
})

// 媒体类型字典
const mediaTypeItems = [
  { title: '通用', value: '' },
  { title: '电影', value: '电影' },
  { title: '电视剧', value: '电视剧' },
]

// 根据选中的媒体类型，获取对应的媒体类别
const getCategories = computed(() => {
  const default_value = [{ title: '全部', value: '' }]
  if (!props.categories || !groupInfo.value.media_type || !props.categories[groupInfo.value.media_type]) {
    return default_value
  }
  return default_value.concat(props.categories[groupInfo.value.media_type] || [])
})

// 规则组规则卡片列表
const filterRuleCards = ref<FilterCard[]>([])

// 导入代码弹窗
const importCodeDialog = ref(false)

// 导入的代码
const importCodeString = ref('')

// 更新规则卡片的值
function updateFilterCardValue(pri: string, rules: string[]) {
  const card = filterRuleCards.value.find(card => card.pri === pri)
  if (card && Array.isArray(rules)) card.rules = rules
}

// 移除卡片
function filterCardClose(pri: string) {
  filterRuleCards.value = filterRuleCards.value
    .filter(card => card.pri !== pri)
    .map((card, index) => {
      card.pri = (index + 1).toString()
      return card
    })
}

// 分享规则
function shareRules() {
  if (filterRuleCards.value.length === 0) return

  const value = filterRuleCards.value
    .filter(card => Array.isArray(card.rules) && card.rules.length > 0)
    .map(card => card.rules.join('&'))
    .join('>')

  try {
    copyToClipboard(value)
    $toast.success('优先级规则已复制到剪贴板')
  } catch (error) {
    $toast.error('优先级规则复制失败！')
  }
}

// 导入规则
async function importRules() {
  importCodeString.value = ''
  importCodeDialog.value = true
}

// 监听导入代码变化
watchEffect(() => {
  if (!importCodeString.value) return

  if (!importCodeString.value.startsWith(' ')) importCodeString.value = ` ${importCodeString.value}`
  if (!importCodeString.value.endsWith(' ')) importCodeString.value = `${importCodeString.value} `

  const groups = importCodeString.value.split('>')
  filterRuleCards.value = groups.map((group: string, index: number) => ({
    pri: (index + 1).toString(),
    rules: group.split('&').filter(rule => rule),
  }))
})

// 增加卡片
function addFilterCard() {
  const pri = (filterRuleCards.value.length + 1).toString()
  const newCard: FilterCard = { pri, rules: [] }
  filterRuleCards.value.push(newCard)
}

// 根据列表的拖动顺序更新优先级
function dragOrderEnd() {
  filterRuleCards.value.forEach((card, index) => {
    card.pri = (index + 1).toString()
  })
}

// 打开详情弹窗
function opengroupInfoDialog() {
  groupInfo.value = cloneDeep(props.group)
  if (props.group.rule_string) {
    filterRuleCards.value = props.group.rule_string.split('>').map((group: string, index: number) => ({
      pri: (index + 1).toString(),
      rules: group.split('&').filter(rule => rule),
    }))
  }
  groupInfoDialog.value = true
}

// 保存详情数据
function saveGroupInfo() {
  if (!groupInfo.value.name.trim()) {
    $toast.error('规则组名称不能为空')
    return
  }
  if (props.groups.some(item => item.name === groupInfo.value.name && item !== props.group)) {
    $toast.error(`规则组名称【${groupInfo.value.name}】已存在，请替换`)
    return
  }

  groupInfoDialog.value = false
  groupInfo.value.rule_string = filterRuleCards.value
    .filter(card => Array.isArray(card.rules) && card.rules.length > 0)
    .map(card => card.rules.join('&'))
    .join('>')
  emit('change', groupInfo.value, props.group.name)
  emit('done')
}

// 按钮点击
function onClose() {
  emit('close')
}
</script>

<template>
  <div>
    <VCard variant="tonal" @click="opengroupInfoDialog">
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
      <DialogCloseBtn @click="onClose" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start">
          <h5 class="text-h6 mb-1">{{ props.group.name }}</h5>
          <div class="text-body-1 mb-3">
            <span v-if="!props.group.category">{{ props.group.media_type || '通用' }}</span>
            <span v-else>{{ props.group.category }}</span>
          </div>
        </div>
        <VImg :src="filter_group_svg" cover class="mt-10" max-width="3rem" />
      </VCardText>
    </VCard>
    <VDialog v-model="groupInfoDialog" scrollable max-width="80rem" persistent>
      <VCard :title="`${props.group.name} - 配置`" class="rounded-t">
        <DialogCloseBtn v-model="groupInfoDialog" />
        <VDivider />
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="groupInfo.name"
                label="规则组名称"
                placeholder="必填；不可与其他规则组重名"
                hint="自定义规则组名称"
                persistent-hint
                active
              />
            </VCol>
            <VCol cols="6" md="3">
              <VSelect
                v-model="groupInfo.media_type"
                label="适用媒体类型"
                :items="mediaTypeItems"
                hint="选择规则组适用的媒体类型"
                persistent-hint
                active
              />
            </VCol>
            <VCol cols="6" md="3">
              <VSelect
                v-model="groupInfo.category"
                :items="getCategories"
                label="适用媒体类别"
                hint="选择规则组适用的媒体类别"
                persistent-hint
                active
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <draggable
            v-model="filterRuleCards"
            handle=".cursor-move"
            item-key="pri"
            tag="div"
            @end="dragOrderEnd"
            :component-data="{ 'class': 'grid gap-3 grid-filterrule-card' }"
          >
            <template #item="{ element }">
              <FilterRuleCard
                :pri="element.pri"
                :maxpri="filterRuleCards.length.toString()"
                :rules="element.rules"
                :custom_rules="props.custom_rules"
                @changed="updateFilterCardValue"
                @close="filterCardClose(element.pri)"
              />
            </template>
          </draggable>
          <div class="text-center" v-if="filterRuleCards.length == 0">请添加或导入规则</div>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn color="primary" variant="tonal" @click="addFilterCard">
            <VIcon icon="mdi-plus" />
          </VBtn>
          <VBtn color="success" variant="tonal" @click="importRules">
            <VIcon icon="mdi-import" />
          </VBtn>
          <VBtn color="info" variant="tonal" @click="shareRules">
            <VIcon icon="mdi-share" />
          </VBtn>
          <VSpacer />
          <VBtn @click="saveGroupInfo" variant="elevated" prepend-icon="mdi-content-save" class="px-5"> 确定 </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <VDialog v-model="importCodeDialog" width="60rem" scrollable>
      <ImportCodeDialog v-model="importCodeString" title="导入优先级规则" @close="importCodeDialog = false" />
    </VDialog>
  </div>
</template>
