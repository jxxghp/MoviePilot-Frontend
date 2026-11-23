<script setup lang="ts">
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { emptyChannelRuleFilters, type ChannelRuleFilters } from '@/utils/channelRuleFilters'
import { useDisplay } from 'vuetify'

const props = defineProps<{
  filters: ChannelRuleFilters
  kinds: { value: string; title: string }[]
  messageTypes?: { value: string; title: string }[]
  audiences?: { value: string; title: string }[]
}>()
const emit = defineEmits<{ close: []; apply: [filters: ChannelRuleFilters] }>()
const { t } = useI18n()
const display = useDisplay()
const draft = ref<ChannelRuleFilters>({
  ...props.filters,
  messageTypes: [...props.filters.messageTypes],
  kinds: [...props.filters.kinds],
  targets: [...props.filters.targets],
  audiences: [...props.filters.audiences],
})
const addressable = new Set(['user', 'group', 'conversation', 'account'])
const canFilterTarget = computed(() =>
  props.kinds.some(
    item => addressable.has(item.value) && (!draft.value.kinds.length || draft.value.kinds.includes(item.value)),
  ),
)

function apply() {
  emit('apply', {
    ...draft.value,
    targets: canFilterTarget.value ? [...new Set(draft.value.targets.map(value => value.trim()).filter(Boolean))] : [],
  })
}
</script>

<template>
  <VDialog
    :model-value="true"
    :fullscreen="!display.mdAndUp.value"
    max-width="36rem"
    scrollable
    @update:model-value="open => !open && emit('close')"
  >
    <VCard :title="t('channelSettings.filterRules')">
      <DialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="d-flex flex-column ga-4">
        <VTextField
          v-model="draft.name"
          :label="t('channelSettings.ruleName')"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          @update:model-value="value => (draft.name = value ?? '')"
        />
        <VSelect
          v-model="draft.status"
          :items="[
            { value: 'all', title: t('channelSettings.ruleStatusAll') },
            { value: 'enabled', title: t('channelSettings.ruleEnabled') },
            { value: 'disabled', title: t('channelSettings.ruleStatusDisabled') },
          ]"
          :label="t('channelSettings.ruleStatus')"
          hide-details
        />
        <VSelect
          v-if="messageTypes"
          v-model="draft.messageTypes"
          :items="messageTypes"
          :label="t('setting.notification.messageType')"
          multiple
          chips
          clearable
          hide-details
        />
        <VSelect
          v-model="draft.kinds"
          :items="kinds"
          :label="t('channelSettings.receiverKind')"
          multiple
          chips
          clearable
          hide-details
        />
        <VCombobox
          v-if="canFilterTarget"
          v-model="draft.targets"
          :label="t('channelSettings.filterTargetIds')"
          :hint="t('channelSettings.filterTargetHint')"
          :delimiters="[',', '，', ';', '；']"
          multiple
          chips
          closable-chips
          clearable
          persistent-hint
        />
        <VSelect
          v-if="audiences"
          v-model="draft.audiences"
          :items="audiences"
          :label="t('channelSettings.deliveryRules.audience')"
          multiple
          chips
          clearable
          hide-details
        />
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn variant="text" @click="draft = emptyChannelRuleFilters()">{{ t('channelSettings.resetFilters') }}</VBtn>
        <VSpacer />
        <VBtn variant="text" @click="emit('close')">{{ t('common.cancel') }}</VBtn>
        <VBtn color="primary" variant="flat" prepend-icon="mdi-filter-check-outline" @click="apply">{{
          t('channelSettings.applyFilters')
        }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
