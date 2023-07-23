<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Sync } from '@/api/types'

const syncs = ref<Sync[]>([])
const source_paths = ref<{ [key: string]: string }[]>([])
const target_paths = ref<{ [key: string]: string }[]>([])

// 提示框
const $toast = useToast()

// 调用API查询目录同步
async function loadSyncs() {
  try {
    const result: Sync[] = await api.get('sync')

    syncs.value = result
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存目录同步
async function saveSync() {
  try {
    const result: { [key: string]: any } = await api.post(
      'sync',
      syncs.value,
    )

    if (result.success)
      $toast.success('媒体同步设置成功')
    else
      $toast.error('媒体同步设置失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API查询下载路径
async function getSourcePaths() {
  try {
    const result: { [key: string]: any } = await api.get('/download/source')
    source_paths.value = result['data']['source_paths']
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API查询目标路径
async function getTargetPaths() {
  try {
    const result: { [key: string]: any } = await api.get('/download/target')
    target_paths.value = result['data']['target_paths']
  }
  catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  loadSyncs()
  getSourcePaths()
  getTargetPaths()
})

// 选项变化
function sourceChanged(type: string[], source: string[]) {
  console.log(source)
   syncs.value.forEach((sync, i) => {
      if (sync['type'] === type){
         console.log(sync['type'],type)
         console.log(sync['source'],source)
         sync['source'] = source
           console.log(sync['source'],type)
      }
   })
  console.log(syncs.value)
}

// 选项变化
function targetChanged(type: string[], target: string[]) {
   syncs.value.forEach((sync, i) => {
      if (sync['type'] === type){
         sync['target'] = target
      }
   })
  console.log(syncs.value)
}

</script>

<template>
  <VCard title="目录同步">
    <VCardText> 媒体库目录同步，源目录必须是DOWNLOAD_PATH子目录，目标目录必须是LIBRARY_PATH子目录 </VCardText>

    <VTable class="text-no-wrap">
      <thead>
        <tr>
          <th scope="col">
            媒体库类型
          </th>
          <th scope="col">
            源目录
          </th>
          <th scope="col">
            目标目录
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="sync in syncs"
          :key="sync.type"
        >
          <td>
            {{ sync.type }}
          </td>
          <td>
            <VSelect
              :key="sync.source"
              variant="underlined"
              :items="source_paths"
              @update:modelValue="sourceChanged(sync.type, item)"
            />
          </td>
          <td>
            <VSelect
              :key="sync.target"
              variant="underlined"
              :items="target_paths"
              @update:modelValue="targetChanged(sync.type, source_paths)"
            />
          </td>
        </tr>
        <tr v-if="syncs.length === 0">
          <td
            colspan="4"
            class="text-center"
          >
            没有设置任何目录同步
          </td>
        </tr>
      </tbody>
    </VTable>
    <VDivider />

    <VCardText>
      <VForm @submit.prevent="() => {}">
        <div class="d-flex flex-wrap gap-4 mt-4">
          <VBtn
            mtype="submit"
            @click="saveSync"
          >
            保存
          </VBtn>
        </div>
      </VForm>
    </VCardText>
  </VCard>
</template>
