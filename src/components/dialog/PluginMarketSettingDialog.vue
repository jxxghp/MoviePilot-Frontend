<script lang="ts" setup>
import api from '@/api'
import draggable from 'vuedraggable'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const display = useDisplay()

const { t } = useI18n()
const $toast = useToast()

const repoList = ref<string[]>([])
const newRepoUrl = ref('')
const editingIndex = ref<number | null>(null)
const editingUrl = ref('')

const emit = defineEmits(['save', 'close'])

async function queryMarketRepoSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/PLUGIN_MARKET')
    if (result && result.data && result.data.value) {
      repoList.value = result.data.value.split(',').filter((repo: string) => repo.trim() !== '')
    }
  } catch (error) {
    console.log(error)
  }
}

async function saveHandle() {
  try {
    const repoStringToSave = repoList.value.join(',')
    const result: { [key: string]: any } = await api.post('system/setting/PLUGIN_MARKET', repoStringToSave)

    if (result.success) {
      $toast.success(t('dialog.pluginMarketSetting.saveSuccess'))
      emit('save')
    } else $toast.error(t('dialog.pluginMarketSetting.saveFailed', { message: result?.message }))
  } catch (error) {
    console.log(error)
  }
}

function addRepo() {
  const url = newRepoUrl.value.trim()
  if (!url) return

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    $toast.error(t('dialog.pluginMarketSetting.invalidUrl'))
    return
  }

  if (repoList.value.includes(url)) {
    $toast.error(t('dialog.pluginMarketSetting.duplicateUrl'))
    return
  }

  repoList.value.push(url)
  newRepoUrl.value = ''
}

function removeRepo(index: number) {
  repoList.value.splice(index, 1)
}

function startEdit(index: number) {
  editingIndex.value = index
  editingUrl.value = repoList.value[index]
}

function saveEdit() {
  if (editingIndex.value === null) return

  const url = editingUrl.value.trim()
  if (!url) return

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    $toast.error(t('dialog.pluginMarketSetting.invalidUrl'))
    return
  }

  repoList.value[editingIndex.value] = url
  editingIndex.value = null
  editingUrl.value = ''
}

function cancelEdit() {
  editingIndex.value = null
  editingUrl.value = ''
}

function formatRepoDisplay(url: string) {
  try {
    const parsedUrl = new URL(url)
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)

    if (
      ['github.com', 'www.github.com', 'raw.githubusercontent.com'].includes(parsedUrl.hostname)
      && pathSegments.length >= 2
    ) {
      return `${pathSegments[0]}/${pathSegments[1].replace(/\.git$/, '')}`
    }
  } catch {
    // Ignore malformed URLs and fall back to the original value.
  }

  return url
}

function repoItemKey(repo: string) {
  return repo
}

onMounted(() => {
  queryMarketRepoSetting()
})
</script>

<template>
  <VDialog width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="plugin-market-dialog-card">
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-store-cog" class="me-2" />
          {{ t('dialog.pluginMarketSetting.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText class="plugin-market-dialog-body pt-4">
        <div class="plugin-market-input mb-4">
          <VTextField
            v-model="newRepoUrl"
            density="compact"
            :placeholder="t('dialog.pluginMarketSetting.urlPlaceholder')"
            prepend-inner-icon="mdi-link-plus"
            clearable
            @keyup.enter="addRepo"
          >
            <template #append>
              <VBtn icon="mdi-plus" variant="text" color="primary" @click="addRepo" />
            </template>
          </VTextField>
        </div>

        <div class="plugin-market-list-wrap">
          <VList v-if="repoList.length > 0" class="px-0">
            <draggable
              v-model="repoList"
              :item-key="repoItemKey"
              handle=".drag-handle"
              animation="200"
              :disabled="editingIndex !== null"
            >
              <template #item="{ element: repo, index }">
                <div>
                  <VListItem class="py-2">
                    <template #prepend>
                      <VBtn
                        icon="mdi-drag-vertical"
                        size="small"
                        variant="text"
                        color="primary"
                        class="drag-handle me-2"
                        :disabled="editingIndex !== null"
                      />
                    </template>

                    <VListItemTitle v-if="editingIndex !== index">
                      <span class="text-truncate" :title="repo">{{ formatRepoDisplay(repo) }}</span>
                    </VListItemTitle>

                    <VTextField
                      v-else
                      v-model="editingUrl"
                      density="compact"
                      variant="outlined"
                      hide-details
                      @keyup.enter="saveEdit"
                      @keyup.escape="cancelEdit"
                    />

                    <template #append v-if="editingIndex !== index">
                      <div class="d-flex align-center">
                        <IconBtn icon="mdi-pencil" size="small" variant="text" @click="startEdit(index)" />
                        <IconBtn
                          icon="mdi-delete"
                          size="small"
                          variant="text"
                          color="error"
                          @click="removeRepo(index)"
                        />
                      </div>
                    </template>

                    <template #append v-else>
                      <div class="d-flex align-center">
                        <IconBtn icon="mdi-check" size="small" variant="text" color="success" @click="saveEdit" />
                        <IconBtn icon="mdi-close" size="small" variant="text" @click="cancelEdit" />
                      </div>
                    </template>
                  </VListItem>
                  <VDivider v-if="index < repoList.length - 1" class="mx-4" />
                </div>
              </template>
            </draggable>
          </VList>

          <div v-else class="text-center text-medium-emphasis py-8">
            <VIcon icon="mdi-folder-open-outline" size="48" class="mb-2" />
            <div>{{ t('dialog.pluginMarketSetting.noRepos') }}</div>
          </div>
        </div>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn
          @click="saveHandle"
          prepend-icon="mdi-content-save-check"
          class="px-5 me-3"
          :disabled="repoList.length === 0"
        >
          {{ t('dialog.pluginMarketSetting.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.plugin-market-dialog-card {
  display: flex;
  flex-direction: column;
}

.plugin-market-dialog-body {
  display: flex;
  overflow: hidden;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
}

.plugin-market-input {
  flex-shrink: 0;
}

.plugin-market-list-wrap {
  flex: 1;
  min-block-size: 0;
  overflow-y: auto;
}
</style>
