<script lang="ts" setup>
import api from "@/api";
import { useToast } from "vue-toast-notification";

// 提示框
const $toast = useToast();

// 自定义识别词
const customIdentifiers = ref("");

// 自定义制作组
const customReleaseGroups = ref("");

// 查询已设置的识别词
const queryCustomIdentifiers = async () => {
  try {
    const result: { [key: string]: any } = await api.get(
      "system/setting/CustomIdentifiers"
    );
    customIdentifiers.value = result.data?.value.join("\n");
  } catch (error) {
    console.log(error);
  }
};

// 查询已设置的制作组
const queryCustomReleaseGroups = async () => {
  try {
    const result: { [key: string]: any } = await api.get(
      "system/setting/CustomReleaseGroups"
    );
    customReleaseGroups.value = result.data?.value.join("\n");
  } catch (error) {
    console.log(error);
  }
};

// 保存用户设置的识别词
const saveCustomIdentifiers = async () => {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      "system/setting/CustomIdentifiers",
      customIdentifiers.value.split("\n")
    );
    if (result.success) {
      $toast.success("自定义识别词保存成功");
    } else {
      $toast.error("自定义识别词保存失败！");
    }
  } catch (error) {
    console.log(error);
  }
};

// 保存自定义制作组
const saveCustomReleaseGroups = async () => {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      "system/setting/CustomReleaseGroups",
      customReleaseGroups.value.split("\n")
    );
    if (result.success) {
      $toast.success("自定义制作组/字幕组保存成功");
    } else {
      $toast.error("自定义制作组/字幕组保存失败！");
    }
  } catch (error) {
    console.log(error);
  }
};

onMounted(() => {
  queryCustomIdentifiers();
  queryCustomReleaseGroups();
});
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="自定义识别词">
        <VCardSubtitle> 自定义识别词辅助识别种子或文件 </VCardSubtitle>
        <VCardItem>
          <VTextarea v-model="customIdentifiers" auto-grow> </VTextarea>
        </VCardItem>
        <VCardItem>
          <VBtn type="submit" @click="saveCustomIdentifiers"> 保存 </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="自定义制作组/字幕组">
        <VCardSubtitle> 添加无法识别的制作组/字幕组 </VCardSubtitle>
        <VCardItem>
          <VTextarea v-model="customReleaseGroups" auto-grow> </VTextarea>
        </VCardItem>
        <VCardItem>
          <VBtn type="submit" @click="saveCustomReleaseGroups"> 保存 </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
  </VRow>
</template>
