<script lang="ts" setup>
import api from "@/api";
import FilterRuleCard from "@/components/cards/FilterRuleCard.vue";
import { useToast } from "vue-toast-notification";

// 规则卡片类型
interface FilterCard {
  // 优先级
  pri: string;
  // 已选规则
  rules: string[];
  // 是否可见
  visible: boolean;
}

// 提示框
const $toast = useToast();

// 种子优先规则
const selectedTorrentPriority = ref<string>("seeder");

// 种子优先规则下拉框
const TorrentPriorityItems = [
  { title: "站点优先", value: "site" },
  { title: "做种数优先", value: "seeder" },
];

// 查询已设置过滤规则
const queryCustomFilters = async () => {
  try {
    const result: { [key: string]: any } = await api.get("system/setting/FilterRules");
    if (result.success) {
      // 保存的是个字符串，需要分割成数组
      const groups = result.data?.value.split(">");
      // 生成规则卡片
      filterCards.value = groups?.map((group: string, index: number) => {
        return {
          pri: (index + 1).toString(),
          rules: group.split("&"),
          visible: true,
        };
      });
    }
  } catch (error) {
    console.log(error);
  }
};

// 查询种子优先规则
const queryTorrentPriority = async () => {
  try {
    const result: { [key: string]: any } = await api.get(
      "system/setting/TorrentsPriority"
    );
    selectedTorrentPriority.value = result.data?.value;
  } catch (error) {
    console.log(error);
  }
};

// 保存用户设置的识别词
const saveCustomFilters = async () => {
  try {
    // 有值才处理
    if (filterCards.value.length === 0) {
      return;
    }
    // 将卡片规则接装为字符串
    const value = filterCards.value
      .filter((card) => card.rules.length > 0)
      .map((card) => card.rules.join("&"))
      .join(">");
    // 保存
    const result: { [key: string]: any } = await api.post(
      "system/setting/FilterRules",
      value
    );
    if (result.success) {
      $toast.success("过滤规则保存成功");
    } else {
      $toast.error("过滤规则保存失败！");
    }
  } catch (error) {
    console.log(error);
  }
};

// 保存种子优先规则
const saveTorrentPriority = async () => {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      "system/setting/TorrentsPriority",
      selectedTorrentPriority.value
    );
    if (result.success) {
      $toast.success("优先规则保存成功");
    } else {
      $toast.error("优先规则保存失败！");
    }
  } catch (error) {
    console.log(error);
  }
};

// 规则卡片列表
const filterCards = ref<FilterCard[]>([]);

// 更新规则卡片的值
const updateFilterCardValue = (pri: string, rules: string[]) => {
  const card = filterCards.value.find((card) => card.pri === pri);
  if (card) {
    card.rules = rules;
  }
};

// 移除卡片
const filterCardClose = (pri: string) => {
  // 将卡片从列表中删除，并更新剩余卡片的序号
  const index = filterCards.value.findIndex((card) => card.pri === pri);
  if (index !== -1) {
    // 创建新的数组，然后使用 splice 方法来删除元素
    const updatedCards = [...filterCards.value];
    updatedCards.splice(index, 1);

    // 更新剩余卡片的序号
    updatedCards.forEach((card, i) => {
      card.pri = (i + 1).toString();
    });

    // 更新 filterCards.value
    filterCards.value = updatedCards;
  }
};

// 增加卡片
const addFilterCard = () => {
  // 优先级
  const pri = (filterCards.value.length + 1).toString();
  // 新卡片
  const newCard: FilterCard = { pri, rules: [], visible: true };
  // 添加到列表
  filterCards.value.push(newCard);
};

onMounted(() => {
  queryTorrentPriority();
  queryCustomFilters();
});
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="过滤规则">
        <VCardSubtitle> 设置在搜索和订阅时默认使用的过滤规则 </VCardSubtitle>
        <VCardItem>
          <div class="grid gap-3 grid-filterrule-card">
            <FilterRuleCard
              v-for="(card, index) in filterCards"
              :key="index"
              :pri="card.pri"
              :rules="card.rules"
              :visible="card.visible"
              @changed="updateFilterCardValue"
              @close="filterCardClose(card.pri)"
            />
          </div>
        </VCardItem>
        <VCardItem>
          <VBtn type="submit" @click="saveCustomFilters" class="me-2"> 保存 </VBtn>
          <VBtn @click="addFilterCard" color="success" variant="tonal">
            <VIcon icon="mdi-plus" />
            <span class="d-none d-sm-block">增加规则</span>
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="下载优先规则">
        <VCardText>
          <VSelect
            v-model="selectedTorrentPriority"
            :items="TorrentPriorityItems"
            label="优先规则"
            outlined
          ></VSelect>
        </VCardText>
        <VCardItem>
          <VBtn type="submit" @click="saveTorrentPriority"> 保存 </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
  </VRow>
</template>
<style type="scss">
.grid-filterrule-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
