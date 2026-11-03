<script lang="ts" setup>
import api from '@/api'
import { getApiErrorMessage } from '@/api/client'
import { addBlacklistRule, listBlacklist, removeBlacklistEntry, type BlacklistEntry } from '@/api/blacklist'
import type { Site } from '@/api/types'
import { useUserStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const toast = useToast()
const userStore = useUserStore()
const entries = ref<BlacklistEntry[]>([])
const page = ref(1)
const total = ref(0)
const pageSize = 20
const loading = ref(false)
const loadError = ref(false)
const saving = ref(false)
const pendingRemovals = ref(new Set<string>())
const keyword = ref<string | null>('')
const uploader = ref<string | null>('')
const siteId = ref<number | null>(null)
const sites = ref<Pick<Site, 'id' | 'name'>[]>([])
const sitesError = ref(false)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const canAdd = computed(() => Boolean(keyword.value?.trim() || uploader.value?.trim() || siteId.value))
let generation = 0
let active = true

/** 只发布当前请求代次的分页结果，翻页和卸载使旧响应失效。 */
async function loadEntries() {
  if (!userStore.superUser) return
  const current = ++generation
  loading.value = true
  loadError.value = false
  try {
    const result = await listBlacklist(page.value, pageSize)
    if (!active || current !== generation) return
    total.value = result.total
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
    if (page.value > lastPage) {
      page.value = lastPage
      return
    }
    entries.value = result.items
  } catch {
    if (active && current === generation) loadError.value = true
  } finally {
    if (active && current === generation) loading.value = false
  }
}

/** 站点下拉只保留配置 ID 和名称，读取失败不妨碍关键词规则。 */
async function loadSites() {
  sitesError.value = false
  try {
    const result = await api.get<Site[]>('site/', { feedback: 'silent' })
    if (active) sites.value = result.map(site => ({ id: site.id, name: site.name }))
  } catch {
    if (active) sitesError.value = true
  }
}

/** 保存非空条件，重复规则也按服务器实际结果反馈。 */
async function addRule() {
  if (!userStore.superUser || saving.value || !canAdd.value) return
  saving.value = true
  try {
    const result = await addBlacklistRule({
      ...(keyword.value?.trim() ? { keyword: keyword.value.trim() } : {}),
      ...(uploader.value?.trim() ? { uploader: uploader.value.trim() } : {}),
      ...(siteId.value ? { site_id: siteId.value } : {}),
    })
    if (!active) return
    toast.success(t(result.created ? 'dialog.blacklist.added' : 'dialog.blacklist.duplicate'))
    keyword.value = ''
    uploader.value = ''
    siteId.value = null
    if (page.value !== 1) page.value = 1
    else await loadEntries()
  } catch (error) {
    if (active) toast.error(getApiErrorMessage(error) || t('dialog.blacklist.addFailed'))
  } finally {
    saving.value = false
  }
}

/** 按行防止重复删除，并用最新总量校正删除后的页码。 */
async function removeEntry(entry: BlacklistEntry) {
  if (!userStore.superUser || pendingRemovals.value.has(entry.id)) return
  pendingRemovals.value.add(entry.id)
  try {
    await removeBlacklistEntry(entry.id)
    if (!active) return
    toast.success(t('dialog.blacklist.removed'))
    await loadEntries()
  } catch (error) {
    if (active) toast.error(getApiErrorMessage(error) || t('dialog.blacklist.removeFailed'))
  } finally {
    pendingRemovals.value.delete(entry.id)
  }
}

/** 安全身份条目只展示摘要，不推测原始下载 URL。 */
function identityLabel(entry: BlacklistEntry): string {
  const identity = entry.identity
  return identity?.hashes[0] || identity?.digests[0] || entry.id
}

watch(page, loadEntries)
onMounted(() => {
  if (!userStore.superUser) return
  void loadEntries()
  void loadSites()
})
onBeforeUnmount(() => {
  active = false
  generation++
})
</script>

<template>
  <VDialog
    v-if="userStore.superUser"
    :model-value="true"
    max-width="48rem"
    scrollable
    @update:model-value="emit('close')"
  >
    <VCard>
      <VCardTitle class="d-flex align-center justify-space-between">
        {{ t('dialog.blacklist.title') }}
        <VBtn icon="mdi-close" variant="text" :aria-label="t('common.close')" @click="emit('close')" />
      </VCardTitle>
      <VCardText>
        <p class="text-body-2 mb-3">{{ t('dialog.blacklist.semantics') }}</p>
        <p class="text-body-2 text-medium-emphasis mb-4">{{ t('dialog.blacklist.limitHint') }}</p>
        <VForm @submit.prevent="addRule">
          <VRow>
            <VCol cols="12">
              <VTextField v-model="keyword" :label="t('dialog.blacklist.keyword')" maxlength="256" clearable />
            </VCol>
            <VCol cols="12" sm="6">
              <VSelect
                v-model="siteId"
                :label="t('dialog.blacklist.site')"
                :menu-props="{ activatorProps: { 'aria-label': t('dialog.blacklist.site') } }"
                :items="sites"
                item-title="name"
                item-value="id"
                clearable
              />
            </VCol>
            <VCol cols="12" sm="6">
              <VTextField v-model="uploader" :label="t('dialog.blacklist.uploader')" maxlength="128" clearable />
            </VCol>
          </VRow>
          <div v-if="sitesError" class="mb-3">
            {{ t('dialog.blacklist.sitesFailed') }}
            <VBtn variant="text" size="small" @click="loadSites">{{ t('common.retry') }}</VBtn>
          </div>
          <VBtn type="submit" :disabled="!canAdd || saving" :loading="saving">{{ t('dialog.blacklist.addRule') }}</VBtn>
        </VForm>
        <VDivider class="my-5" />
        <div v-if="loadError" role="alert">
          {{ t('dialog.blacklist.loadFailed') }}
          <VBtn variant="text" @click="loadEntries">{{ t('common.retry') }}</VBtn>
        </div>
        <VProgressLinear v-else-if="loading" indeterminate :aria-label="t('dialog.blacklist.loading')" />
        <VList v-else-if="entries.length">
          <VListItem v-for="entry in entries" :key="entry.id" class="py-3">
            <VListItemTitle>{{
              entry.rule?.keyword ||
              t(entry.kind === 'resource' ? 'dialog.blacklist.resource' : 'dialog.blacklist.manual')
            }}</VListItemTitle>
            <div v-if="entry.rule" class="text-body-2">
              <span v-if="entry.rule.site_id"
                >{{ t('dialog.blacklist.site') }}:
                {{ sites.find(site => site.id === entry.rule?.site_id)?.name || entry.rule.site_id }}
              </span>
              <span v-if="entry.rule.uploader">{{ t('dialog.blacklist.uploader') }}: {{ entry.rule.uploader }}</span>
            </div>
            <div v-else class="text-body-2 text-break">{{ identityLabel(entry) }}</div>
            <VListItemSubtitle>{{ new Date(entry.created_at).toLocaleString() }}</VListItemSubtitle>
            <template #append>
              <VBtn
                icon="mdi-delete-outline"
                variant="text"
                :aria-label="t('dialog.blacklist.remove')"
                :disabled="pendingRemovals.has(entry.id)"
                :loading="pendingRemovals.has(entry.id)"
                @click="removeEntry(entry)"
              />
            </template>
          </VListItem>
        </VList>
        <p v-else class="text-medium-emphasis">{{ t('dialog.blacklist.empty') }}</p>
        <VPagination
          v-if="pageCount > 1"
          v-model="page"
          :length="pageCount"
          :total-visible="5"
          :next-aria-label="t('dialog.blacklist.nextPage')"
          :previous-aria-label="t('dialog.blacklist.previousPage')"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>
