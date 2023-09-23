<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'

// 提示框
const $toast = useToast()

// 种子优先规则
const selectedTorrentPriority = ref<string>('seeder')

// 种子优先规则下拉框
const TorrentPriorityItems = [
  { title: '站点优先', value: 'site' },
  { title: '做种数优先', value: 'seeder' },
]

// 包含与排除规则
const defaultFilterRules = ref({
  include: '',
  exclude: '',
})

// 查询种子优先规则
async function queryTorrentPriority() {
  try {
    const result: { [key: string]: any } = await api.get(
      'system/setting/TorrentsPriority',
    )

    selectedTorrentPriority.value = result.data?.value
  }
  catch (error) {
    console.log(error)
  }
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

// 保存种子优先规则
async function saveTorrentPriority() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      'system/setting/TorrentsPriority',
      selectedTorrentPriority.value,
    )

    if (result.success)
      $toast.success('优先规则保存成功')
    else
      $toast.error('优先规则保存失败！')
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
  queryTorrentPriority()
  queryDefaultFilter()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="下载优先规则">
        <VCardSubtitle> 按站点优先级或资源种子数量排序和择优下载。 </VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedTorrentPriority"
                  :items="TorrentPriorityItems"
                  label="优先规则"
                  outlined
                />
              </VCol>
            </VRow>
          </vform>
        </VCardText>
        <VCardItem>
          <VBtn
            type="submit"
            @click="saveTorrentPriority"
          >
            保存
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="默认过滤规则">
        <VCardSubtitle> 设置在搜索和订阅时默认使用的过滤规则。 </VCardSubtitle>
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
