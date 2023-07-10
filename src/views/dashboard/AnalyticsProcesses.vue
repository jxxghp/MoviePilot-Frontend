<script lang="ts" setup>
import { formatSeconds } from "@/@core/utils/formatters";
import api from "@/api";
import { Process } from "@/api/types";

const headers = ["进程ID", "进程名称", "运行时间", "内存占用"];

const processList = ref<Process[]>([]);

// 调用API加载数据
const loadProcessList = async () => {
  try {
    const res: Process[] = await api.get("dashboard/processes");
    processList.value = res;
  } catch (e) {
    console.log(e);
  }
};

onMounted(() => {
  loadProcessList();
});
</script>

<template>
  <VCard>
    <VTable
      :headers="headers"
      :items="processList"
      item-key="fullName"
      class="table-rounded"
      hide-default-footer
      disable-sort
    >
      <thead>
        <tr>
          <th v-for="header in headers" :key="header" :id="header">
            {{ header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in processList" :key="row.pid">
          <td class="text-sm" v-text="row.pid" />
          <!-- name -->
          <td>
            <h6 class="text-sm font-weight-medium">{{ row.name }}</h6>
          </td>
          <td class="text-sm" v-text="formatSeconds(row.run_time)" />
          <td class="text-sm" v-text="`${row.memory} MB`" />
        </tr>
      </tbody>
    </VTable>
  </VCard>
</template>
