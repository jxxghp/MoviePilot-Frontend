<script setup lang="ts">
import draggable from 'vuedraggable'
import api from '@/api'
import type { CategoryConfig } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 定义输入参数
defineProps<{
  modelValue?: boolean
}>()

// 定义事件
const emit = defineEmits(['close', 'save'])

const activeTab = ref('movie')
const loading = ref(false)
const saving = ref(false)
const toast = useToast()
const { t } = useI18n()

const generateId = () => {
  return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now()
}

interface CategoryItem {
  id: string
  name: string
  rule: any
}

const movieList = ref<CategoryItem[]>([])
const tvList = ref<CategoryItem[]>([])

// TMDB 类型映射
const genreOptions = [
  { title: '动作 (Action)', value: '28' },
  { title: '冒险 (Adventure)', value: '12' },
  { title: '动画 (Animation)', value: '16' },
  { title: '喜剧 (Comedy)', value: '35' },
  { title: '犯罪 (Crime)', value: '80' },
  { title: '纪录 (Documentary)', value: '99' },
  { title: '剧情 (Drama)', value: '18' },
  { title: '家庭 (Family)', value: '10751' },
  { title: '奇幻 (Fantasy)', value: '14' },
  { title: '历史 (History)', value: '36' },
  { title: '恐怖 (Horror)', value: '27' },
  { title: '音乐 (Music)', value: '10402' },
  { title: '悬疑 (Mystery)', value: '9648' },
  { title: '爱情 (Romance)', value: '10749' },
  { title: '科幻 (SF)', value: '878' },
  { title: '电视电影', value: '10770' },
  { title: '惊悚 (Thriller)', value: '53' },
  { title: '战争 (War)', value: '10752' },
  { title: '西部 (Western)', value: '37' },
  { title: '儿童 (Kids)', value: '10762' },
  { title: '新闻 (News)', value: '10763' },
  { title: '真人秀 (Reality)', value: '10764' },
  { title: '科幻/奇幻 (Sci-Fi)', value: '10765' },
  { title: '肥皂剧 (Soap)', value: '10766' },
  { title: '访谈 (Talk)', value: '10767' },
  { title: '战争/政治', value: '10768' },
]

// 语种选项 (original_language)
const languageOptions = [
  { title: '中文', value: 'zh' },
  { title: '中文', value: 'cn' },
  { title: '英语 (English)', value: 'en' },
  { title: '日语 (Japanese)', value: 'ja' },
  { title: '韩语 (Korean)', value: 'ko' },
  { title: '法语 (French)', value: 'fr' },
  { title: '德语 (German)', value: 'de' },
  { title: '西班牙语 (Spanish)', value: 'es' },
  { title: '意大利语 (Italian)', value: 'it' },
  { title: '葡萄牙语 (Portuguese)', value: 'pt' },
  { title: '俄语 (Russian)', value: 'ru' },
  { title: '阿拉伯语', value: 'ar' },
  { title: '泰语 (Thai)', value: 'th' },
  { title: '越南语 (Vietnamese)', value: 'vi' },
  { title: '印地语 (Hindi)', value: 'hi' },
  { title: '土耳其语 (Turkish)', value: 'tr' },
  { title: '荷兰语 (Dutch)', value: 'nl' },
  { title: '波兰语 (Polish)', value: 'pl' },
  { title: '瑞典语 (Swedish)', value: 'sv' },
  { title: '丹麦语 (Danish)', value: 'da' },
  { title: '挪威语 (Norwegian)', value: 'nb' },
  { title: '芬兰语 (Finnish)', value: 'fi' },
  { title: '希腊语 (Greek)', value: 'el' },
  { title: '捷克语 (Czech)', value: 'cs' },
  { title: '匈牙利语 (Hungarian)', value: 'hu' },
  { title: '罗马尼亚语 (Romanian)', value: 'ro' },
  { title: '乌克兰语 (Ukrainian)', value: 'uk' },
  { title: '印度尼西亚语 (Indonesian)', value: 'id' },
  { title: '马来语 (Malay)', value: 'ms' },
  { title: '希伯来语 (Hebrew)', value: 'he' },
]

// 国家/地区选项 (origin_country/production_countries)
const countryOptions = [
  { title: '中国大陆 (CN)', value: 'CN' },
  { title: '中国香港 (HK)', value: 'HK' },
  { title: '中国台湾 (TW)', value: 'TW' },
  { title: '美国 (US)', value: 'US' },
  { title: '英国 (GB)', value: 'GB' },
  { title: '日本 (JP)', value: 'JP' },
  { title: '韩国 (KR)', value: 'KR' },
  { title: '法国 (FR)', value: 'FR' },
  { title: '德国 (DE)', value: 'DE' },
  { title: '意大利 (IT)', value: 'IT' },
  { title: '西班牙 (ES)', value: 'ES' },
  { title: '加拿大 (CA)', value: 'CA' },
  { title: '澳大利亚 (AU)', value: 'AU' },
  { title: '俄罗斯 (RU)', value: 'RU' },
  { title: '印度 (IN)', value: 'IN' },
  { title: '泰国 (TH)', value: 'TH' },
  { title: '新加坡 (SG)', value: 'SG' },
  { title: '马来西亚 (MY)', value: 'MY' },
  { title: '越南 (VN)', value: 'VN' },
  { title: '菲律宾 (PH)', value: 'PH' },
  { title: '巴西 (BR)', value: 'BR' },
  { title: '墨西哥 (MX)', value: 'MX' },
  { title: '阿根廷 (AR)', value: 'AR' },
  { title: '荷兰 (NL)', value: 'NL' },
  { title: '比利时 (BE)', value: 'BE' },
  { title: '瑞士 (CH)', value: 'CH' },
  { title: '瑞典 (SE)', value: 'SE' },
  { title: '挪威 (NO)', value: 'NO' },
  { title: '丹麦 (DK)', value: 'DK' },
  { title: '波兰 (PL)', value: 'PL' },
  { title: '捷克 (CZ)', value: 'CZ' },
  { title: '土耳其 (TR)', value: 'TR' },
  { title: '以色列 (IL)', value: 'IL' },
  { title: '埃及 (EG)', value: 'EG' },
  { title: '南非 (ZA)', value: 'ZA' },
  { title: '新西兰 (NZ)', value: 'NZ' },
]

const fetchConfig = async () => {
  loading.value = true
  try {
    const res: any = await api.get('media/category/config')
    if (res && res.data) {
      parseConfig(res.data)
    }
  } catch (e) {
    console.error(e)
    toast.error(t('setting.category.loadFailed'))
  } finally {
    loading.value = false
  }
}

const parseConfig = (data: CategoryConfig) => {
  // 将对象 { "Name": { ... } } 转换为数组 [ { id: uuid, name: "Name", rule: { ... } } ]
  movieList.value = []
  if (data.movie) {
    for (const [key, value] of Object.entries(data.movie)) {
      // 为了UI一致性处理 genre_ids 为数组或字符串，但 API 发送的是字符串
      const rule = { ...value }
      if (rule.genre_ids && typeof rule.genre_ids === 'string') {
        // UI 多选预期为数组，检查输入。实际上 VAutocomplete 多选预期数组。我们需要将字符串分割为数组。
        // @ts-ignore
        rule.genre_ids = rule.genre_ids.split(',')
      } else {
        // @ts-ignore
        rule.genre_ids = []
      }

      // 处理语种
      if (rule.original_language && typeof rule.original_language === 'string') {
        // @ts-ignore
        rule.original_language = rule.original_language.split(',')
      } else {
        // @ts-ignore
        rule.original_language = []
      }

      // 处理制片国家/地区
      if (rule.production_countries && typeof rule.production_countries === 'string') {
        // @ts-ignore
        rule.production_countries = rule.production_countries.split(',')
      } else {
        // @ts-ignore
        rule.production_countries = []
      }

      movieList.value.push({
        id: generateId(),
        name: key,
        rule: rule as any,
      })
    }
  }

  tvList.value = []
  if (data.tv) {
    for (const [key, value] of Object.entries(data.tv)) {
      const rule = { ...value }
      if (rule.genre_ids && typeof rule.genre_ids === 'string') {
        // @ts-ignore
        rule.genre_ids = rule.genre_ids.split(',')
      } else {
        // @ts-ignore
        rule.genre_ids = []
      }

      // 处理语种
      if (rule.original_language && typeof rule.original_language === 'string') {
        // @ts-ignore
        rule.original_language = rule.original_language.split(',')
      } else {
        // @ts-ignore
        rule.original_language = []
      }

      // 处理发行国家/地区
      if (rule.origin_country && typeof rule.origin_country === 'string') {
        // @ts-ignore
        rule.origin_country = rule.origin_country.split(',')
      } else {
        // @ts-ignore
        rule.origin_country = []
      }

      tvList.value.push({
        id: generateId(),
        name: key,
        rule: rule as any,
      })
    }
  }
}

const addMovieItem = () => {
  movieList.value.push({
    id: generateId(),
    name: '新分类',
    rule: { genre_ids: [] as any },
  })
}

const removeMovieItem = (index: number) => {
  movieList.value.splice(index, 1)
}

const addTvItem = () => {
  tvList.value.push({
    id: generateId(),
    name: '新分类',
    rule: { genre_ids: [] as any },
  })
}

const removeTvItem = (index: number) => {
  tvList.value.splice(index, 1)
}

const saveConfig = async () => {
  saving.value = true
  try {
    // 将数组转换回对象
    const payload: CategoryConfig = {
      movie: {},
      tv: {},
    }

    movieList.value.forEach(item => {
      if (item.name) {
        const rule = { ...item.rule }
        // 将 genre_ids 数组转换回字符串
        if (Array.isArray(rule.genre_ids) && rule.genre_ids.length > 0) {
          rule.genre_ids = rule.genre_ids.join(',')
        } else {
          // @ts-ignore
          rule.genre_ids = null
        }

        // 将 original_language 数组转换回字符串
        if (Array.isArray(rule.original_language) && rule.original_language.length > 0) {
          rule.original_language = rule.original_language.join(',')
        } else {
          rule.original_language = undefined
        }

        // 将 production_countries 数组转换回字符串
        if (Array.isArray(rule.production_countries) && rule.production_countries.length > 0) {
          rule.production_countries = rule.production_countries.join(',')
        } else {
          rule.production_countries = undefined
        }

        // 清理空字符串
        if (!rule.release_year) rule.release_year = undefined

        // @ts-ignore
        payload.movie[item.name] = rule
      }
    })

    tvList.value.forEach(item => {
      if (item.name) {
        const rule = { ...item.rule }
        if (Array.isArray(rule.genre_ids) && rule.genre_ids.length > 0) {
          rule.genre_ids = rule.genre_ids.join(',')
        } else {
          // @ts-ignore
          rule.genre_ids = null
        }

        // 将 original_language 数组转换回字符串
        if (Array.isArray(rule.original_language) && rule.original_language.length > 0) {
          rule.original_language = rule.original_language.join(',')
        } else {
          rule.original_language = undefined
        }

        // 将 origin_country 数组转换回字符串
        if (Array.isArray(rule.origin_country) && rule.origin_country.length > 0) {
          rule.origin_country = rule.origin_country.join(',')
        } else {
          rule.origin_country = undefined
        }

        // 清理空字符串
        if (!rule.release_year) rule.release_year = undefined

        // @ts-ignore
        payload.tv[item.name] = rule
      }
    })

    const res: any = await api.post('media/category/config', payload)
    if (res && res.success) {
      toast.success(t('setting.category.saveSuccess'))
      emit('save')
      emit('close')
    } else {
      toast.error(t('setting.category.saveFailed', { message: res.message || 'Error' }))
    }
  } catch (e) {
    console.error(e)
    toast.error(t('setting.category.saveFailed', { message: 'Network or Config Error' }))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchConfig()
})
</script>

<template>
  <VDialog :model-value="modelValue" max-width="1000" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardItem class="py-3">
        <template #prepend>
          <VIcon icon="mdi-shape-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('setting.category.title') }}
        </VCardTitle>
        <VCardSubtitle>
          {{ t('setting.category.subtitle') }}
        </VCardSubtitle>
      </VCardItem>

      <VCardText>
        <VTabs v-model="activeTab" show-arrows class="mb-4">
          <VTab value="movie">
            <VIcon icon="mdi-movie-outline" class="me-2" />
            {{ t('setting.category.movie') }}
          </VTab>
          <VTab value="tv">
            <VIcon icon="mdi-television" class="me-2" />
            {{ t('setting.category.tv') }}
          </VTab>
        </VTabs>

        <div v-if="loading" class="d-flex justify-center align-center" style="min-block-size: 300px">
          <VProgressCircular indeterminate color="primary" size="64" />
        </div>

        <VWindow v-else v-model="activeTab" class="disable-tab-transition" :touch="false">
          <VWindowItem value="movie">
            <draggable v-model="movieList" handle=".drag-handle" item-key="id" animation="200">
              <template #item="{ element, index }">
                <VCard variant="tonal" class="mb-4 category-item">
                  <VCardText class="pa-4">
                    <div class="d-flex align-center mb-5">
                      <VTextField
                        v-model="element.name"
                        :label="t('setting.category.name')"
                        density="comfortable"
                        hide-details
                        variant="plain"
                        class="font-bold"
                        prepend-inner-icon="mdi-tag-outline"
                      />
                      <VSpacer />
                      <VBtn
                        icon="mdi-drag-vertical"
                        variant="text"
                        size="small"
                        class="drag-handle me-2"
                        color="primary"
                      />
                      <VBtn
                        icon="mdi-delete-outline"
                        color="error"
                        variant="text"
                        size="small"
                        @click="removeMovieItem(index)"
                      />
                    </div>

                    <VRow>
                      <VCol cols="12" md="6">
                        <VAutocomplete
                          v-model="element.rule.genre_ids"
                          :items="genreOptions"
                          :label="t('setting.category.genre')"
                          item-title="title"
                          item-value="value"
                          multiple
                          chips
                          closable-chips
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-movie-filter-outline"
                        />
                      </VCol>
                      <VCol cols="12" md="6">
                        <VAutocomplete
                          v-model="element.rule.production_countries"
                          :items="countryOptions"
                          :label="t('setting.category.country')"
                          item-title="title"
                          item-value="value"
                          multiple
                          chips
                          closable-chips
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-earth"
                        />
                      </VCol>
                      <VCol cols="12" md="6">
                        <VAutocomplete
                          v-model="element.rule.original_language"
                          :items="languageOptions"
                          :label="t('setting.category.language')"
                          item-title="title"
                          item-value="value"
                          multiple
                          chips
                          closable-chips
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-translate"
                        />
                      </VCol>
                      <VCol cols="12" md="6">
                        <VTextField
                          v-model="element.rule.release_year"
                          :label="t('setting.category.year')"
                          :placeholder="t('setting.category.yearPlaceholder')"
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-calendar-range"
                        />
                      </VCol>
                    </VRow>
                  </VCardText>
                </VCard>
              </template>
            </draggable>

            <VBtn
              block
              variant="outlined"
              size="large"
              prepend-icon="mdi-plus-circle-outline"
              class="mt-2 add-category-btn"
              @click="addMovieItem"
            >
              {{ t('setting.category.addMovie') }}
            </VBtn>
          </VWindowItem>

          <VWindowItem value="tv">
            <draggable v-model="tvList" handle=".drag-handle" item-key="id" animation="200">
              <template #item="{ element, index }">
                <VCard variant="tonal" class="mb-4 category-item">
                  <VCardText class="pa-4">
                    <div class="d-flex align-center mb-5">
                      <VTextField
                        v-model="element.name"
                        :label="t('setting.category.name')"
                        density="comfortable"
                        hide-details
                        variant="plain"
                        class="font-bold"
                        prepend-inner-icon="mdi-tag-outline"
                      />
                      <VSpacer />
                      <VBtn
                        icon="mdi-drag-vertical"
                        variant="text"
                        size="small"
                        class="drag-handle me-2"
                        color="primary"
                      />
                      <VBtn
                        icon="mdi-delete-outline"
                        color="error"
                        variant="text"
                        size="small"
                        @click="removeTvItem(index)"
                      />
                    </div>

                    <VRow>
                      <VCol cols="12" md="6">
                        <VAutocomplete
                          v-model="element.rule.genre_ids"
                          :items="genreOptions"
                          :label="t('setting.category.genre')"
                          item-title="title"
                          item-value="value"
                          multiple
                          chips
                          closable-chips
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-movie-filter-outline"
                        />
                      </VCol>
                      <VCol cols="12" md="6">
                        <VAutocomplete
                          v-model="element.rule.origin_country"
                          :items="countryOptions"
                          :label="t('setting.category.country')"
                          item-title="title"
                          item-value="value"
                          multiple
                          chips
                          closable-chips
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-earth"
                        />
                      </VCol>
                      <VCol cols="12" md="6">
                        <VAutocomplete
                          v-model="element.rule.original_language"
                          :items="languageOptions"
                          :label="t('setting.category.language')"
                          item-title="title"
                          item-value="value"
                          multiple
                          chips
                          closable-chips
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-translate"
                        />
                      </VCol>
                      <VCol cols="12" md="6">
                        <VTextField
                          v-model="element.rule.release_year"
                          :label="t('setting.category.year')"
                          :placeholder="t('setting.category.yearPlaceholder')"
                          density="comfortable"
                          variant="outlined"
                          persistent-hint
                          prepend-inner-icon="mdi-calendar-range"
                        />
                      </VCol>
                    </VRow>
                  </VCardText>
                </VCard>
              </template>
            </draggable>

            <VBtn
              block
              variant="outlined"
              size="large"
              prepend-icon="mdi-plus-circle-outline"
              class="mt-2 add-category-btn"
              @click="addTvItem"
            >
              {{ t('setting.category.addTv') }}
            </VBtn>
          </VWindowItem>
        </VWindow>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :loading="saving"
          prepend-icon="mdi-content-save"
          class="px-5"
          @click="saveConfig"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.drag-handle {
  cursor: grab;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.drag-handle:hover {
  opacity: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.add-category-btn {
  border-style: dashed !important;
  transition: all 0.2s ease;
}

.add-category-btn:hover {
  border-style: solid !important;
  transform: translateY(-1px);
}

.disable-tab-transition > * {
  transition: none !important;
}
</style>
