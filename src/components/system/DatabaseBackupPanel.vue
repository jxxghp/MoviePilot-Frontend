<script setup lang="ts">
import { formatBytes } from '@core/utils/formatters'
import {
  createDatabaseBackup,
  listDatabaseBackups,
  verifyDatabaseBackup,
  type DatabaseBackupArtifact,
  type DatabaseBackupVerification,
} from '@/api/databaseBackup'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ active: boolean }>()

const { t, locale } = useI18n()
const toast = useToast()
const backups = ref<DatabaseBackupArtifact[]>([])
const loading = ref(false)
const creating = ref(false)
const loaded = ref(false)
const loadFailed = ref(false)
const verifyingNames = ref(new Set<string>())
const verificationResults = ref<Record<string, DatabaseBackupVerification>>({})

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function databaseTypeLabel(value: string): string {
  return value === 'postgresql' ? 'PostgreSQL' : 'SQLite'
}

async function loadBackups() {
  if (loading.value) return
  loading.value = true
  loadFailed.value = false
  try {
    backups.value = await listDatabaseBackups()
    loaded.value = true
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function createBackup() {
  if (creating.value) return
  creating.value = true
  try {
    await createDatabaseBackup()
    toast.success(t('setting.system.dbBackupCreateSuccess'))
    await loadBackups()
  } catch {
    toast.error(t('setting.system.dbBackupCreateFailed'))
  } finally {
    creating.value = false
  }
}

async function verifyBackup(name: string) {
  if (verifyingNames.value.has(name)) return
  verifyingNames.value = new Set(verifyingNames.value).add(name)
  try {
    const result = await verifyDatabaseBackup(name)
    verificationResults.value = { ...verificationResults.value, [name]: result }
    if (result.valid) toast.success(t('setting.system.dbBackupVerifySuccess'))
    else toast.error(t('setting.system.dbBackupVerifyInvalid'))
  } catch {
    toast.error(t('setting.system.dbBackupVerifyFailed'))
  } finally {
    const next = new Set(verifyingNames.value)
    next.delete(name)
    verifyingNames.value = next
  }
}

watch(
  () => props.active,
  active => {
    if (active && !loaded.value) void loadBackups()
  },
  { immediate: true },
)
</script>

<template>
  <section class="database-backup-panel" :aria-label="t('setting.system.dbBackupManagement')">
    <VDivider class="mb-5" />

    <div class="d-flex flex-wrap align-center justify-space-between gap-3 mb-3">
      <div>
        <div class="d-flex align-center text-subtitle-1 font-weight-medium">
          <VIcon icon="mdi-database-clock-outline" class="me-2" />
          {{ t('setting.system.dbBackupManagement') }}
        </div>
        <div class="text-body-2 text-medium-emphasis mt-1">
          {{ t('setting.system.dbBackupManagementHint') }}
        </div>
      </div>

      <div class="d-flex align-center gap-2">
        <VTooltip :text="t('setting.system.dbBackupRefresh')">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon="mdi-refresh"
              size="small"
              variant="text"
              :aria-label="t('setting.system.dbBackupRefresh')"
              :loading="loading"
              @click="loadBackups"
            />
          </template>
        </VTooltip>
        <VBtn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-database-plus-outline"
          :loading="creating"
          :disabled="loading"
          @click="createBackup"
        >
          {{ t('setting.system.dbBackupCreate') }}
        </VBtn>
      </div>
    </div>

    <VAlert v-if="loadFailed" type="error" variant="tonal" density="compact" class="mb-3">
      <div class="d-flex flex-wrap align-center justify-space-between gap-2">
        <span>{{ t('setting.system.dbBackupLoadFailed') }}</span>
        <VBtn size="small" variant="text" prepend-icon="mdi-refresh" @click="loadBackups">
          {{ t('common.retry') }}
        </VBtn>
      </div>
    </VAlert>

    <VProgressLinear v-if="loading && !loaded" indeterminate color="primary" class="mb-2" />

    <div class="database-backup-table">
      <VTable density="compact" hover>
        <thead>
          <tr>
            <th>{{ t('setting.system.dbBackupName') }}</th>
            <th>{{ t('setting.system.dbBackupType') }}</th>
            <th>{{ t('setting.system.dbBackupCreatedAt') }}</th>
            <th>{{ t('setting.system.dbBackupSize') }}</th>
            <th>{{ t('setting.system.dbBackupVerification') }}</th>
            <th class="text-end">{{ t('setting.system.dbBackupActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="backup in backups" :key="backup.name">
            <td class="font-weight-medium text-no-wrap">{{ backup.name }}</td>
            <td>{{ databaseTypeLabel(backup.db_type) }}</td>
            <td class="text-no-wrap">{{ formatCreatedAt(backup.created_at) }}</td>
            <td class="text-no-wrap">{{ formatBytes(backup.size) }}</td>
            <td>
              <VChip
                v-if="verificationResults[backup.name]"
                :color="verificationResults[backup.name].valid ? 'success' : 'error'"
                size="small"
                variant="tonal"
              >
                {{
                  verificationResults[backup.name].valid
                    ? t('setting.system.dbBackupValid')
                    : t('setting.system.dbBackupInvalid')
                }}
              </VChip>
              <span v-else class="text-medium-emphasis">{{ t('setting.system.dbBackupNotVerified') }}</span>
            </td>
            <td class="text-end">
              <VTooltip :text="t('setting.system.dbBackupVerify')">
                <template #activator="{ props: tooltipProps }">
                  <VBtn
                    v-bind="tooltipProps"
                    icon="mdi-shield-check-outline"
                    size="small"
                    variant="text"
                    :aria-label="t('setting.system.dbBackupVerifyName', { name: backup.name })"
                    :loading="verifyingNames.has(backup.name)"
                    @click="verifyBackup(backup.name)"
                  />
                </template>
              </VTooltip>
            </td>
          </tr>
          <tr v-if="loaded && backups.length === 0">
            <td colspan="6" class="text-center text-medium-emphasis py-8">
              <VIcon icon="mdi-database-off-outline" size="28" class="mb-2" />
              <div>{{ t('setting.system.dbBackupEmpty') }}</div>
            </td>
          </tr>
        </tbody>
      </VTable>
    </div>
  </section>
</template>

<style scoped>
.database-backup-table {
  overflow-x: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.database-backup-table :deep(th) {
  white-space: nowrap;
}
</style>
