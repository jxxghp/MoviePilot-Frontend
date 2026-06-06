<script lang="ts" setup>
import { formatSeconds } from '@/@core/utils/formatters'
import api from '@/api'
import type { Process } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 表头
const headers = [
  t('dashboard.processes.pid'),
  t('dashboard.processes.name'),
  t('dashboard.processes.runtime'),
  t('dashboard.processes.memory'),
]

// 数据列表
const processList = ref<Process[]>([])

// 调用API加载数据
async function loadProcessList() {
  try {
    const res: Process[] = await api.get('dashboard/processes')

    processList.value = res
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
useDataRefresh(
  'dashboard-processes',
  loadProcessList,
  5000, // 5秒间隔
  true // 立即执行
)
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>{{ t('dashboard.processes.title') }}</VCardTitle>
    </VCardItem>
    <VTable item-key="fullName" class="table-rounded" hide-default-footer disable-sort>
      <thead>
        <tr>
          <th v-for="header in headers" :id="header" :key="header">
            {{ header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in processList" :key="row.pid">
          <td class="text-sm" v-text="row.pid" />
          <!-- name -->
          <td>
            <h6 class="text-sm font-weight-medium">
              {{ row.name }}
            </h6>
          </td>
          <td class="text-sm" v-text="formatSeconds(row.run_time)" />
          <td class="text-sm" v-text="`${row.memory} MB`" />
        </tr>
      </tbody>
    </VTable>
  </VCard>
</template>
