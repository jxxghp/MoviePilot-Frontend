<script lang="ts" setup>
// App捷径
const appsMenu = ref(false);
</script>

<template>
  <VMenu
    v-model="appsMenu"
    max-width="600"
    width="340"
    max-height="560"
    close-on-content-click
  >
    <!-- Menu Activator -->
    <template #activator="{ props }">
      <IconBtn class="me-2" v-bind="props">
        <VIcon icon="mdi-apps" />
      </IconBtn>
    </template>
    <!-- Menu Content -->
    <VCard title="捷径">
      <VDivider />
      <div class="ps ps--active-y">
        <VRow class="ma-0 mt-n1">
          <VCol
            cols="6"
            class="text-center border-t cursor-pointer pa-0 shortcut-icon border-e"
          >
            <VListItem @click="() => {}" class="pa-4">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-text-recognition" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">识别</h6>
              <span class="text-sm">名称识别测试</span>
            </VListItem>
          </VCol>
          <VCol
            @click="() => {}"
            cols="6"
            class="text-center border-t cursor-pointer pa-0 shortcut-icon"
          >
            <VListItem @click="() => {}" class="pa-4">
              <VAvatar size="48" variant="tonal">
                <VIcon icon="mdi-network-outline" />
              </VAvatar>
              <h6 class="text-base font-weight-medium mt-2 mb-0">网络</h6>
              <span class="text-sm">测试网速连通性</span>
            </VListItem>
          </VCol>
        </VRow>
      </div>
    </VCard>
  </VMenu>
</template>
