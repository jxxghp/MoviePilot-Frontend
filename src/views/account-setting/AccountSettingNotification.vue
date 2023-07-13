<script lang="ts" setup>
const messageTypes = ref([
  {
    type: "资源下载",
    wechat: true,
    telegram: true,
    slack: true,
  },
  {
    type: "整理入库",
    wechat: true,
    telegram: true,
    slack: true,
  },
  {
    type: "订阅",
    wechat: true,
    telegram: true,
    slack: true,
  },
  {
    type: "站点消息",
    wechat: true,
    telegram: true,
    slack: true,
  },
  {
    type: "媒体服务器通知",
    wechat: true,
    telegram: true,
    slack: true,
  },
]);
</script>

<template>
  <VCard title="消息通知">
    <VCardText> 对应消息类型只会发送给选中的消息渠道 </VCardText>

    <VTable class="text-no-wrap">
      <thead>
        <tr>
          <th scope="col">消息类型</th>
          <th scope="col">微信</th>
          <th scope="col">Telegram</th>
          <th scope="col">Slack</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="message in messageTypes" :key="message.type">
          <td>
            {{ message.type }}
          </td>
          <td>
            <VCheckbox v-model="message.wechat" />
          </td>
          <td>
            <VCheckbox v-model="message.telegram" />
          </td>
          <td>
            <VCheckbox v-model="message.slack" />
          </td>
        </tr>
      </tbody>
    </VTable>
    <VDivider />

    <VCardText>
      <VForm @submit.prevent="() => {}">
        <div class="d-flex flex-wrap gap-4 mt-4">
          <VBtn type="submit"> 保存 </VBtn>
        </div>
      </VForm>
    </VCardText>
  </VCard>
</template>
