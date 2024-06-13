<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'

// 系统环境变量
const systemEnv = ref<any>({})

// 所有Release
const allRelease = ref<any>([])

// 变更日志对话框
const releaseDialog = ref(false)

// 最新版本
const latestRelease = ref('')

// 变更日志对话框标题
const releaseDialogTitle = ref('')

// 变更日志对话框内容
const releaseDialogBody = ref('')

// 打开日志对话框
function showReleaseDialog(title: string, body: string) {
  releaseDialogTitle.value = title
  releaseDialogBody.value = body.replaceAll('\r\n', '<br />')
  releaseDialog.value = true
}

// 查询系统环境变量
async function querySystemEnv() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')

    systemEnv.value = result.data
  } catch (error) {
    console.log(error)
  }
}

// 查询所有Release
async function queryAllRelease() {
  try {
    const result: { [key: string]: any } = await api.get('system/versions')

    allRelease.value = result.data ?? []

    // 最新版本
    if (allRelease.value.length > 0) latestRelease.value = allRelease.value[0].tag_name
  } catch (error) {
    console.log(error)
  }
}

// 计算发布时间
function releaseTime(releaseDate: string) {
  // 上一次更新时间
  return formatDateDifference(releaseDate)
}

onMounted(() => {
  querySystemEnv()
  queryAllRelease()
})
</script>

<template>
  <div class="px-3">
    <div class="section">
      <div>
        <h3 class="heading">关于 MoviePilot</h3>
      </div>
      <div class="section border-t border-gray-800">
        <dl>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">软件版本</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow flex flex-row items-center truncate">
                  <code class="truncate">{{ systemEnv.VERSION }}</code>
                  <a
                    v-if="latestRelease === systemEnv.VERSION"
                    href="https://github.com/jxxghp/MoviePilot/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span
                      class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap bg-green-500 bg-opacity-80 border border-green-500 !text-green-100 ml-2 !cursor-pointer transition hover:bg-green-400"
                    >
                      最新
                    </span>
                  </a>
                </span>
              </dd>
            </div>
          </div>
          <div v-if="systemEnv.FRONTEND_VERSION">
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">前端版本</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow flex flex-row items-center truncate">
                  <code class="truncate">{{ systemEnv.FRONTEND_VERSION }}</code>
                </span>
              </dd>
            </div>
          </div>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">认证资源版本</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow flex flex-row items-center truncate">
                  <code class="truncate">{{ systemEnv.AUTH_VERSION }}</code>
                </span>
              </dd>
            </div>
          </div>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">站点资源版本</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow flex flex-row items-center truncate">
                  <code class="truncate">{{ systemEnv.INDEXER_VERSION }}</code>
                </span>
              </dd>
            </div>
          </div>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">配置目录</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow undefined">
                  <code>{{ systemEnv.CONFIG_DIR }}</code>
                </span>
              </dd>
            </div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">数据目录</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow undefined"><code>/moviepilot</code></span>
              </dd>
            </div>
          </div>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">时区</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow undefined">
                  <code>{{ systemEnv.TZ }}</code>
                </span>
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </div>
    <div class="section">
      <div>
        <h3 class="heading">支援</h3>
      </div>
      <div class="section border-t border-gray-800">
        <dl>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">文档</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow undefined">
                  <a
                    href="https://github.com/jxxghp/MoviePilot/blob/main/README.md"
                    target="_blank"
                    rel="noreferrer"
                    class="text-indigo-500 transition duration-300 hover:underline"
                  >
                    https://wiki.movie-pilot.org
                  </a>
                </span>
              </dd>
            </div>
          </div>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">问题反馈</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow undefined">
                  <a
                    href="https://github.com/jxxghp/MoviePilot/issues/new/choose"
                    target="_blank"
                    rel="noreferrer"
                    class="text-indigo-500 transition duration-300 hover:underline"
                  >
                    https://github.com/jxxghp/MoviePilot/issues/new/choose
                  </a>
                </span>
              </dd>
            </div>
          </div>
          <div>
            <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="block text-sm font-bold">发布频道</dt>
              <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                <span class="flex-grow undefined">
                  <a
                    href="https://t.me/moviepilot_channel"
                    target="_blank"
                    rel="noreferrer"
                    class="text-indigo-500 transition duration-300 hover:underline"
                  >
                    https://t.me/moviepilot_channel
                  </a>
                </span>
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </div>
    <div class="section">
      <div>
        <h3 class="heading">软件版本</h3>
        <div class="section space-y-3">
          <div>
            <div
              v-for="release in allRelease"
              :key="release.tag_name"
              class="mb-3 flex w-full flex-col space-y-3 rounded-md px-4 py-2 shadow-md ring-1 ring-gray-400 sm:flex-row sm:space-y-0 sm:space-x-3"
            >
              <div class="flex w-full flex-grow items-center justify-start space-x-2 truncate sm:justify-start">
                <span class="truncate text-lg font-bold">
                  <span class="mr-2 whitespace-nowrap text-xs font-normal">{{
                    releaseTime(release.published_at)
                  }}</span>
                  {{ release.tag_name }}
                </span>
                <span
                  v-if="release.tag_name === latestRelease"
                  class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap cursor-default bg-green-500 bg-opacity-80 border border-green-500 !text-green-100"
                >
                  最新软件版本
                </span>
                <span
                  v-if="release.tag_name === systemEnv.VERSION"
                  class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap cursor-default bg-indigo-500 bg-opacity-80 border border-indigo-500 !text-indigo-100"
                >
                  当前版本
                </span>
              </div>
              <VBtn @click.stop="showReleaseDialog(release.tag_name, release.body)">
                <template #prepend>
                  <VIcon icon="mdi-text-box-outline" />
                </template>
                查看变更日志
              </VBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <VDialog v-model="releaseDialog" width="600" scrollable>
    <VCard>
      <VCardItem>
        <DialogCloseBtn @click="releaseDialog = false" />
        <VCardTitle>{{ releaseDialogTitle }} 变更日志</VCardTitle>
      </VCardItem>
      <VCardText v-html="releaseDialogBody" />
    </VCard>
  </VDialog>
</template>

<style type="scss">
.heading {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 2rem;

  --tw-text-opacity: 1;
}

.section {
  margin-block: 0.5rem 2.5rem;
}
</style>
