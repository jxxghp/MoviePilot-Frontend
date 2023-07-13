<script lang="ts" setup>
import api from "@/api";
import { NotificationSwitch } from "@/api/types";
import { useToast } from "vue-toast-notification";

const messagemTypes = ref<NotificationSwitch[]>([]);

// 提示框
const $toast = useToast();

// 调用API查询消息开关
const loadNotificationSwitchs = async () => {
  try {
    const result: NotificationSwitch[] = await api.get("message/switchs");
    messagemTypes.value = result;
  } catch (error) {
    console.log(error);
  }
};

// 调用API保存消息开关
const saveNotificationSwitchs = async () => {
  try {
    const result: { [key: string]: any } = await api.post("message/switchs", messagemTypes.value);
    if (result.success) {
      $toast.success("保存通知消息设置成功");
    } else {
      $toast.error("保存通知消息设置失败！");
    }
    messagemTypes.value = messagemTypes.value;
  } catch (error) {
    console.log(error);
  }
};

onMounted(() => {
  loadNotificationSwitchs();
});
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
        <tr v-for="message in messagemTypes" :key="message.mtype">
          <td>
            {{ message.mtype }}
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
        <tr v-if="messagemTypes.length === 0">
          <td colspan="4" align="center">没有设置任何通知渠道</td>
        </tr>
      </tbody>
    </VTable>
    <VDivider />

    <VCardText>
      <VForm @submit.prevent="() => { }">
        <div class="d-flex flex-wrap gap-4 mt-4">
          <VBtn mtype="submit" @click="saveNotificationSwitchs"> 保存 </VBtn>
        </div>
      </VForm>
    </VCardText>
  </VCard>
</template>
