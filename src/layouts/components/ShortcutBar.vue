<script lang="ts" setup>
import NameTestView from '@/views/system/NameTestView.vue'
import NetTestView from '@/views/system/NetTestView.vue'
import LoggingView from '@/views/system/LoggingView.vue'
import RuleTestView from '@/views/system/RuleTestView.vue'

// App捷径
const appsMenu = ref(false)

// 名称测试弹窗
const nameTestDialog = ref(false)

// 网络测试弹窗
const netTestDialog = ref(false)

// 实时日志弹窗
const loggingDialog = ref(false)

// 过滤规则弹窗
const ruleTestDialog = ref(false)
</script>

<template>
  <VMenu
    v-model="appsMenu"
    max-width="600"
    width="340"
    max-height="560"
    location="top end"
    origin="top end"
    transition="scale-transition"
    close-on-content-click
  >
    <!-- Menu Activator -->
    <template #activator="{ props }">
      <IconBtn
        class="me-2"
        v-bind="props"
      >
        <VIcon icon="mdi-checkbox-multiple-blank-outline" />
      </IconBtn>
    </template>
    <!-- Menu Content -->
    <VCard>
      <VCardItem class="border-b">
        <VCardTitle>捷径</VCardTitle>
        <template #append>
          <IconBtn @click="() => {}">
            <VIcon icon="mdi-checkbox-multiple-blank-outline" />
          </IconBtn>
        </template>
      </VCardItem>
      <div class="ps ps--active-y">
        <VRow class="ma-0 mt-n1">
          <VCol
            cols="6"
            class="text-center cursor-pointer pa-0 shortcut-icon border-e"
          >
            <VListItem
              class="pa-4"
              @click="nameTestDialog = true"
            >
              <VAvatar
                size="48"
                variant="tonal"
              >
                <VIcon icon="mdi-text-recognition" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">
                识别
              </h6>
              <span class="text-sm">名称识别测试</span>
            </VListItem>
          </VCol>
          <VCol
            cols="6"
            class="text-center cursor-pointer pa-0 shortcut-icon"
            @click="() => {}"
          >
            <VListItem
              class="pa-4"
              @click="netTestDialog = true"
            >
              <VAvatar
                size="48"
                variant="tonal"
              >
                <VIcon icon="mdi-network-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">
                网络
              </h6>
              <span class="text-sm">测试网速连通性</span>
            </VListItem>
          </VCol>
        </VRow>
        <VRow class="ma-0 mt-n1 border-t">
          <VCol
            cols="6"
            class="text-center cursor-pointer pa-0 shortcut-icon border-e"
            @click="() => {}"
          >
            <VListItem
              class="pa-4"
              @click="loggingDialog = true"
            >
              <VAvatar
                size="48"
                variant="tonal"
              >
                <VIcon icon="mdi-file-document-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">
                日志
              </h6>
              <span class="text-sm">系统实时日志</span>
            </VListItem>
          </VCol>
          <VCol
            cols="6"
            class="text-center cursor-pointer pa-0 shortcut-icon border-e"
            @click="() => {}"
          >
            <VListItem
              class="pa-4"
              @click="ruleTestDialog = true"
            >
              <VAvatar
                size="48"
                variant="tonal"
              >
                <VIcon icon="mdi-filter-cog-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">
                规则
              </h6>
              <span class="text-sm">过滤规则测试</span>
            </VListItem>
          </VCol>
        </VRow>
      </div>
    </VCard>
  </VMenu>
  <!-- 名称测试弹窗 -->
  <VDialog
    v-model="nameTestDialog"
    max-width="50rem"
  >
    <VCard title="名称识别测试">
      <DialogCloseBtn @click="nameTestDialog = false" />
      <VCardItem>
        <NameTestView />
      </VCardItem>
    </VCard>
  </VDialog>
  <!-- 网络测试弹窗 -->
  <VDialog
    v-model="netTestDialog"
    max-width="35rem"
  >
    <VCard title="网络测试">
      <DialogCloseBtn @click="netTestDialog = false" />
      <VCardItem>
        <NetTestView />
      </VCardItem>
    </VCard>
  </VDialog>
  <!-- 实时日志弹窗 -->
  <VDialog
    v-model="loggingDialog"
    class="w-full lg:w-4/5"
    scrollable
  >
    <VCard title="实时日志">
      <DialogCloseBtn @click="loggingDialog = false" />
      <VCardText>
        <LoggingView />
      </VCardText>
    </VCard>
  </VDialog>
  <!-- 规则测试弹窗 -->
  <VDialog
    v-model="ruleTestDialog"
    max-width="50rem"
    scrollable
  >
    <VCard title="过滤规则测试">
      <DialogCloseBtn @click="ruleTestDialog = false" />
      <VCardText>
        <RuleTestView />
      </VCardText>
    </VCard>
  </VDialog>
</template>
