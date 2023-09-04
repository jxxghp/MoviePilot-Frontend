<script setup lang="ts">
import AnalyticsMediaStatistic from '@/views/dashboard/AnalyticsMediaStatistic.vue'
import AnalyticsScheduler from '@/views/dashboard/AnalyticsScheduler.vue'
import AnalyticsSpeed from '@/views/dashboard/AnalyticsSpeed.vue'
import AnalyticsStorage from '@/views/dashboard/AnalyticsStorage.vue'
import AnalyticsWeeklyOverview from '@/views/dashboard/AnalyticsWeeklyOverview.vue'
import AnalyticsCpu from '@/views/dashboard/AnalyticsCpu.vue'
import AnalyticsMemory from '@/views/dashboard/AnalyticsMemory.vue'
</script>

<template>
  <VRow class="match-height">
    <VCol
      cols="12"
      md="4"
    >
      <AnalyticsStorage />
    </VCol>

    <VCol
      cols="12"
      md="8"
    >
      <AnalyticsMediaStatistic />
    </VCol>

    <VCol
      cols="12"
      md="4"
    >
      <AnalyticsWeeklyOverview />
    </VCol>

    <VCol
      cols="12"
      md="4"
    >
      <AnalyticsSpeed />
    </VCol>

    <VCol
      cols="12"
      md="4"
    >
      <AnalyticsScheduler />
    </VCol>

    <VCol
      cols="12"
      md="6"
    >
      <AnalyticsCpu />
    </VCol>

    <VCol
      cols="12"
      md="6"
    >
      <AnalyticsMemory />
    </VCol>
  </VRow>
</template>
