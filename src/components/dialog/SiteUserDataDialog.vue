<script lang="ts" setup>
import type { Site, SiteUserData } from '@/api/types'
import api from '@/api'
import { useDisplay, useTheme } from 'vuetify'
import { VAvatar, VCardText, VIcon } from 'vuetify/lib/components/index.mjs'
import { formatFileSize } from '@/@core/utils/formatters'
import VueApexCharts from 'vue3-apexcharts'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
})

// 注册事件
const emit = defineEmits(['close'])

const vuetifyTheme = useTheme()

const currentTheme = controlledComputed(
  () => vuetifyTheme.name.value,
  () => vuetifyTheme.current.value.colors,
)

// 站点数据列表
const siteDatas = ref<SiteUserData[]>([])

// 最新一天的数据，按时间倒序排序后取第一条记录
const siteData = computed(() => siteDatas.value[0])

// 站点数据列表中的上传量、下载量数据生成图形使用的数据
const historySeries = computed(() => {
  return [
    {
      name: '上传量',
      data: siteDatas.value.map(item => Math.round((item.upload ?? 0) / 1024 / 1024 / 1024)),
    },
    {
      name: '下载量',
      data: siteDatas.value.map(item => Math.round((item.download ?? 0) / 1024 / 1024 / 1024)),
    },
  ]
})

// 图形选项
const historyChartOptions = computed(() => {
  return {
    chart: {
      type: 'area',
      parentHeightOffset: 0,
      toolbar: { show: false },
      animations: { enabled: true },
      dataLabels: {
        enabled: true,
      },
      zoom: {
        autoScaleYaxis: true,
      },
    },
    tooltip: {
      enabled: true,
      tooltip: {
        x: {
          format: 'dd MMM yyyy',
        },
      },
    },
    grid: {
      xaxis: {
        lines: { show: false },
      },
      yaxis: {
        title: {
          text: 'GB',
        },
        lines: { show: true },
      },
    },
    stroke: {
      width: 3,
      lineCap: 'butt',
      curve: 'smooth',
    },
    colors: [currentTheme.value.success, currentTheme.value.warning],
    markers: {
      size: 0,
      style: 'hollow',
    },
    xaxis: {
      type: 'category',
      categories: siteDatas.value.map(item => item.updated_day),
      labels: {
        show: true,
        formatter: function (val: string) {
          return new Date(val).toLocaleDateString('zh-CN')
        },
      },
    },
    yaxis: {
      title: {
        text: 'GB',
      },
      labels: {
        formatter: function (val: number) {
          return val.toLocaleString()
        },
      },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.5,
        opacityTo: 0.7,
        stops: [0, 100],
      },
    },
  }
})

// 做种分布列，seeding_info的格式为[[x, y], [x, y], ...]，x为做种数，y为做种体积，做种体积需要转换为GB
const seedingSeries = computed(() => {
  return [
    {
      name: '体积',
      data: siteData.value?.seeding_info?.map(item => [item[0] ?? 0, Math.round((item[1] ?? 0) / 1024 / 1024 / 1024)]),
    },
  ]
})

// 做种分布图形选项
const seedingChartOptions = computed(() => {
  return {
    chart: {
      type: 'scatter',
      parentHeightOffset: 0,
      toolbar: { show: false },
      animations: { enabled: true },
      zoom: {
        autoScaleYaxis: true,
      },
    },
    tooltip: {
      enabled: true,
      x: {
        formatter: function (val: number) {
          return '数量：' + val.toLocaleString()
        },
      },
    },
    grid: {
      xaxis: {
        lines: { show: true },
      },
      yaxis: {
        lines: { show: true },
      },
    },
    colors: [currentTheme.value.primary],
    xaxis: {
      type: 'numeric',
      labels: {
        show: true,
        formatter: function (val: number) {
          return Math.round(val).toLocaleString()
        },
      },
      title: {
        text: '数量',
      },
      tickAmount: 10,
    },
    yaxis: {
      title: {
        text: 'GB',
      },
      labels: {
        formatter: function (val: number) {
          return val.toLocaleString() + ' GB'
        },
      },
    },
  }
})

// 根据传入属性，计算列表数据中第一条与第二条的差值，如果没有第二条则差值为全部
const diffData: { [key: string]: any } = computed(() => {
  if (siteDatas.value.length < 2) {
    return siteData.value
  }
  const first = siteDatas.value[siteDatas.value.length - 1]
  const second = siteDatas.value[siteDatas.value.length - 2]
  return {
    bonus: (first.bonus ?? 0) - (second.bonus ?? 0),
    ratio: (first.ratio ?? 0) - (second.ratio ?? 0),
    upload: (first.upload ?? 0) - (second.upload ?? 0),
    download: (first.download ?? 0) - (second.download ?? 0),
    seeding: (first.seeding ?? 0) - (second.seeding ?? 0),
    seeding_size: (first.seeding_size ?? 0) - (second.seeding_size ?? 0),
  }
})

// 格式化差值
function getDiffString(diff: number | undefined, format: boolean = true) {
  if (diff === undefined) {
    return '0'
  }
  if (format) {
    return diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()
  }
  return diff >= 0 ? `+${diff}` : diff
}

// 根据差值的正负，返回不同的样式
function getDiffClass(diff: number | undefined) {
  if (diff === undefined) {
    return ''
  }
  if (diff == 0) {
    return ''
  }
  return diff > 0 ? 'text-success' : 'text-error'
}

// 查询站点用户数据
async function fetchSiteUserData() {
  try {
    const result: { [key: string]: any } = await api.get(`site/userdata/${props.site?.id}`)
    if (result.success) {
      siteDatas.value = result.data.sort((a: { updated_day: any }, b: { updated_day: any }) =>
        (a.updated_day || '').localeCompare(b.updated_day || ''),
      )
    }
  } catch (error) {
    console.error(error)
  }
}

onBeforeMount(async () => {
  await fetchSiteUserData()
})
</script>

<template>
  <VDialog scrollable eager max-width="80rem" :fullscreen="!display.mdAndUp.value">
    <VCard :title="`数据 - ${props.site?.name}`" class="rounded-t">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText>
        <VRow class="match-height">
          <!-- 用户信息 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">用户等级</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.user_level || '无' }}
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-account"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 积分 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">积分</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.bonus?.toLocaleString() }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.bonus)">
                        ({{ getDiffString(diffData?.bonus) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-scoreboard"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 分享率 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">分享率</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.ratio }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.ratio)">
                        ({{ getDiffString(diffData?.ratio) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-percent"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总上传量 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">总上传量</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ formatFileSize(siteData?.upload || 0) }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.upload)">
                        ({{ formatFileSize(diffData?.upload || 0, 2, true) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-upload"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总下载量 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">总下载量</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ formatFileSize(siteData?.download || 0) }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.download)">
                        ({{ formatFileSize(diffData?.download || 0, 2, true) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-download"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总做种数 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">总做种数</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.seeding?.toLocaleString() }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.seeding)">
                        ({{ getDiffString(diffData?.seeding) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-seed"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总做种体积 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">总做种体积</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ formatFileSize(siteData?.seeding_size || 0) }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.seeding_size)">
                        ({{ formatFileSize(diffData?.seeding_size || 0, 2, true) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-database"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 加入时间 -->
          <VCol cols="12" md="3">
            <VCard>
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">加入时间</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.join_at?.split(' ')[0] }}
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-calendar"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
        <VRow>
          <VCol>
            <VCard title="历史流量">
              <VCardText>
                <VueApexCharts type="line" :options="historyChartOptions" :series="historySeries" :height="300" />
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
        <VRow>
          <VCol>
            <VCard title="做种分布">
              <VCardText>
                <VueApexCharts type="scatter" :options="seedingChartOptions" :series="seedingSeries" :height="300" />
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
      </VCardText>
    </VCard>
  </VDialog>
</template>
