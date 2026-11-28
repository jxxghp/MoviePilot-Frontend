<script setup lang="ts">
/** Discord 拥有命令注册作用域表单，后端模块独立校验实际 ID。 */
defineProps<{ disabled?: boolean }>()
const model = defineModel<Record<string, unknown>>({ required: true })
const { t } = useI18n()
const guild = computed({
  get: () => String(model.value.command_guild_id ?? ''),
  set: value => {
    model.value = { ...model.value, command_guild_id: value }
  },
})
</script>

<template>
  <VTextField
    v-model="guild"
    inputmode="numeric"
    :label="t('channelSettings.deliveryRules.guild')"
    :hint="t('channelSettings.deliveryRules.guildHint')"
    persistent-hint
    :disabled="disabled"
  />
</template>
