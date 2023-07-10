<script setup lang="ts">
import CardStatisticsVertical from "@/components/cards/CardStatisticsVertical.vue";
import AnalyticsBarCharts from "@/views/dashboard/AnalyticsBarCharts.vue";
import AnalyticsDepositWithdraw from "@/views/dashboard/AnalyticsDepositWithdraw.vue";
import AnalyticsMediaStatistic from "@/views/dashboard/AnalyticsMediaStatistic.vue";
import AnalyticsProcesses from "@/views/dashboard/AnalyticsProcesses.vue";
import AnalyticsSalesByCountries from "@/views/dashboard/AnalyticsSalesByCountries.vue";
import AnalyticsStorage from "@/views/dashboard/AnalyticsStorage.vue";
import AnalyticsTotalEarning from "@/views/dashboard/AnalyticsTotalEarning.vue";
import AnalyticsTotalProfitLineCharts from "@/views/dashboard/AnalyticsTotalProfitLineCharts.vue";
import AnalyticsWeeklyOverview from "@/views/dashboard/AnalyticsWeeklyOverview.vue";

const totalProfit = {
  title: "Total Profit",
  color: "secondary",
  icon: "mdi-poll",
  stats: "$25.6k",
  change: 42,
  subtitle: "Weekly Project",
};

const newProject = {
  title: "New Project",
  color: "primary",
  icon: "mdi-briefcase-variant-outline",
  stats: "862",
  change: -18,
  subtitle: "Yearly Project",
};
</script>

<template>
  <VRow class="match-height">
    <VCol cols="12" md="4">
      <AnalyticsStorage />
    </VCol>

    <VCol cols="12" md="8">
      <AnalyticsMediaStatistic />
    </VCol>

    <VCol cols="12" md="4">
      <AnalyticsWeeklyOverview />
    </VCol>

    <VCol cols="12" md="4">
      <AnalyticsTotalEarning />
    </VCol>

    <VCol cols="12" md="4">
      <VRow class="match-height">
        <VCol cols="12" sm="6">
          <AnalyticsTotalProfitLineCharts />
        </VCol>

        <VCol cols="12" sm="6">
          <CardStatisticsVertical v-bind="totalProfit" />
        </VCol>

        <VCol cols="12" sm="6">
          <CardStatisticsVertical v-bind="newProject" />
        </VCol>

        <VCol cols="12" sm="6">
          <AnalyticsBarCharts />
        </VCol>
      </VRow>
    </VCol>

    <VCol cols="12" md="4">
      <AnalyticsSalesByCountries />
    </VCol>

    <VCol cols="12" md="8">
      <AnalyticsDepositWithdraw />
    </VCol>

    <VCol cols="12">
      <AnalyticsProcesses />
    </VCol>
  </VRow>
</template>
