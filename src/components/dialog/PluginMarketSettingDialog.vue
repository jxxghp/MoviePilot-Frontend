<script lang="ts" setup>
import api from '@/api'
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

function moveUp(index: number) {
  if (index === 0) return
  const temp = repoList.value[index]
  repoList.value[index] = repoList.value[index - 1]
  repoList.value[index - 1] = temp
}

function moveDown(index: number) {
  if (index === repoList.value.length - 1) return
  const temp = repoList.value[index]
  repoList.value[index] = repoList.value[index + 1]
  repoList.value[index + 1] = temp
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
            <template v-for="(repo, index) in repoList" :key="index">
              <VListItem class="py-2">
                <template #prepend>
                  <div class="d-flex align-center me-2">
                    <VBtn
                      icon="mdi-chevron-up"
                      size="x-small"
                      variant="text"
                      @click="moveUp(index)"
                      :disabled="index === 0"
                    />
                    <VBtn
                      icon="mdi-chevron-down"
                      size="x-small"
                      variant="text"
                      @click="moveDown(index)"
                      :disabled="index === repoList.length - 1"
                    />
                  </div>
                </template>

                <VListItemTitle v-if="editingIndex !== index">
                  <span class="text-truncate">{{ repo }}</span>
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
                    <IconBtn icon="mdi-delete" size="small" variant="text" color="error" @click="removeRepo(index)" />
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
            </template>
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
