<script setup lang="ts">
import api from '@/api'

// 定义所有的模块ID、名称列表
const modules = ref<
  {
    id: string
    name: string
    state: 'success' | 'error' | 'warning' | 'info' | undefined
    errmsg: string
    loading: boolean
  }[]
>([])

// 调用API查询模块列表
async function getModules() {
  try {
    const result: { [key: string]: any } = await api.get('system/modulelist')
    if (result.success) {
      const moduleList = result.data?.modules
      if (moduleList) {
        moduleList.forEach((module: { id: string; name: string }) => {
          modules.value.push({ id: module.id, name: module.name, state: undefined, errmsg: '', loading: false })
        })
        // 逐个检查所有模块
        for (let i = 0; i < modules.value.length; i++) await moduleTest(i)
      }
    }
  } catch (error) {
    console.error(error)
  }
}

// 调用API测试模块
async function moduleTest(index: number) {
  try {
    const target = modules.value[index]
    const moduleid = target.id
    target.loading = true
    const result: { [key: string]: any } = await api.get(`system/moduletest/${moduleid}`)
    target.loading = false
    if (result.success) {
      target.state = 'success'
      target.name = `${target.name} - 正常`
    } else if (result.message?.includes('模块未加载')) {
      target.state = undefined
      target.name = `${target.name} - 未启用`
    } else {
      target.state = 'error'
      target.name = `${target.name} - 错误！`
      target.errmsg = result.message
    }
  } catch (error) {
    console.error(error)
  }
}

// 加载
onMounted(getModules)
</script>

<template>
  <VAlert
    v-for="(module, index) in modules"
    :key="index"
    :type="module.state"
    :title="module.name"
    class="mb-2"
    variant="tonal"
  >
    {{ module.errmsg }}
    <template #append>
      <VProgressCircular v-if="module.loading" indeterminate />
    </template>
  </VAlert>
</template>
