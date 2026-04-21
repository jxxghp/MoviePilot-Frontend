<script lang="ts" setup>
import draggable from 'vuedraggable'
import { copyToClipboard } from '@/@core/utils/navigator'
import { CustomRule, FilterRuleGroup } from '@/api/types'
import FilterRuleCard from '@/components/cards/FilterRuleCard.vue'
import { useToast } from 'vue-toastification'
import ImportCodeDialog from '@/components/dialog/ImportCodeDialog.vue'
import filter_group_svg from '@images/svg/filter-group.svg'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 获取i18n实例
const { t } = useI18n()

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
  { title: t('common.all'), value: '' },
  { title: t('mediaType.movie'), value: '电影' },
  { title: t('mediaType.tv'), value: '电视剧' },
]

// 根据选中的媒体类型，获取对应的媒体类别
const getCategories = computed(() => {
  const default_value = [{ title: t('common.all'), value: '' }]
  if (!props.categories || !groupInfo.value.media_type || !props.categories[groupInfo.value.media_type]) {
    return default_value
  }
  return default_value.concat(props.categories[groupInfo.value.media_type] || [])
})

// 规则组规则卡片列表
const filterRuleCards = ref<FilterCard[]>([])

// 导入代码弹窗
const importCodeDialog = ref(false)

// 导入代码类型
const importCodeType = ref('')

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
async function shareRules() {
  if (filterRuleCards.value.length === 0) return

  const value = filterRuleCards.value
    .filter(card => Array.isArray(card.rules) && card.rules.length > 0)
    .map(card => card.rules.join('&'))
    .join('>')

  try {
    let success
    success = copyToClipboard(value)
    if (await success) $toast.success(t('filterRule.shareSuccess'))
    else $toast.error(t('filterRule.shareFailed'))
  } catch (error) {
    $toast.error(t('filterRule.shareFailed'))
    console.error(error)
  }
}

// 导入规则
async function importRules(ruleType: string) {
  importCodeType.value = ruleType
  importCodeDialog.value = true
}

// 保存导入的代码，直接覆盖原有值
function saveCodeString(type: string, code: any) {
  try {
    code = code.value
    if (type === 'priority') {
      // 解析值
      if (!code) return
      // 首尾增加空格
      if (!code.startsWith(' ')) code = ` ${code}`
      if (!code.endsWith(' ')) code = `${code} `
      const groups = code.split('>')
      filterRuleCards.value = groups.map((group: string, index: number) => ({
        pri: (index + 1).toString(),
        rules: group.split('&').filter(rule => rule),
      }))
    }
  } catch (error) {
    $toast.error(t('filterRule.importFailed'))
    console.error(error)
  }
}

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
    $toast.error(t('filterRule.nameRequired'))
    return
  }
  if (props.groups.some(item => item.name === groupInfo.value.name && item !== props.group)) {
    $toast.error(t('filterRule.nameDuplicate'))
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
    <VCard variant="tonal" class="app-card-shell" @click="opengroupInfoDialog">
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
      <VDialogCloseBtn @click="onClose" />
      <VCardText class="app-card-summary app-card-summary--double-action app-card-summary--title-subtitle">
        <div class="app-card-summary__content">
          <h5 class="app-card-summary__title text-h6">{{ props.group.name }}</h5>
          <div class="app-card-summary__subtitle text-body-1">
            <span v-if="!props.group.category">{{ props.group.media_type || t('common.all') }}</span>
            <span v-else>{{ props.group.category }}</span>
          </div>
        </div>
        <div class="app-card-summary__media" aria-hidden="true">
          <VImg :src="filter_group_svg" contain class="app-card-summary__image" />
        </div>
      </VCardText>
    </VCard>
    <VDialog
      v-if="groupInfoDialog"
      v-model="groupInfoDialog"
      scrollable
      max-width="80rem"
      :fullscreen="!display.mdAndUp.value"
    >
      <VCard :title="`${props.group.name} - ${t('filterRule.title')}`">
        <VDialogCloseBtn v-model="groupInfoDialog" />
        <VDivider />
        <VCardItem class="pt-1">
          <VRow class="mt-1">
            <VCol cols="12" md="6">
              <VTextField
                v-model="groupInfo.name"
                :label="t('filterRule.groupName')"
                :placeholder="t('filterRule.nameRequired')"
                :hint="t('filterRule.groupName')"
                persistent-hint
                active
                prepend-inner-icon="mdi-label"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VAutocomplete
                v-model="groupInfo.media_type"
                :label="t('filterRule.mediaType')"
                :items="mediaTypeItems"
                :hint="t('filterRule.mediaType')"
                persistent-hint
                active
                prepend-inner-icon="mdi-movie-open"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VAutocomplete
                v-model="groupInfo.category"
                :items="getCategories"
                :label="t('filterRule.category')"
                :hint="t('filterRule.category')"
                persistent-hint
                active
                prepend-inner-icon="mdi-folder-open"
              />
            </VCol>
          </VRow>
        </VCardItem>
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
          <div class="text-center" v-if="filterRuleCards.length == 0">{{ t('filterRule.add') }}</div>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn color="primary" @click="addFilterCard">
            <VIcon icon="mdi-plus" />
          </VBtn>
          <VBtn color="success" @click="importRules('priority')">
            <VIcon icon="mdi-import" />
          </VBtn>
          <VBtn color="info" @click="shareRules">
            <VIcon icon="mdi-share" />
          </VBtn>
          <VSpacer />
          <VBtn @click="saveGroupInfo" prepend-icon="mdi-content-save" class="px-5">
            {{ t('common.save') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <ImportCodeDialog
      v-if="importCodeDialog"
      v-model="importCodeDialog"
      :title="t('filterRule.import')"
      :dataType="importCodeType"
      @close="importCodeDialog = false"
      @save="saveCodeString"
    />
  </div>
</template>
