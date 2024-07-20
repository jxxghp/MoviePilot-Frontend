<script setup lang="ts">
import { User } from '@/api/types'
import avatar1 from '@images/avatars/avatar-1.png'

// 定义输入变量
defineProps({
  user: {
    type: Object as PropType<User>,
    required: true,
  },
})

// 用户电影订阅数量
const movieSubscriptions = 0
// 用户电视剧订阅数量
const tvShowSubscriptions = 0
</script>
<template>
  <VCard>
    <VCardText class="text-center pt-10 pb-3">
      <VAvatar variant="flat" size="100" rounded>
        <VImg :src="user.avatar ?? avatar1" alt="avatar" />
      </VAvatar>
      <h5 class="text-h5 mt-3">{{ user.name }}</h5>
      <VChip size="small" class="mt-3" :class="{ 'text-error': user.is_superuser }">
        {{ user.is_superuser ? '管理员' : '普通用户' }}
      </VChip>
    </VCardText>
    <VCardText class="flex justify-center gap-6 pb-5">
      <div class="d-flex align-center">
        <VAvatar size="40" color="primary" rounded variant="tonal" class="me-4">
          <VIcon size="24" icon="mdi-movie-open-outline"></VIcon>
        </VAvatar>
        <div>
          <div class="text-h6">{{ movieSubscriptions }}</div>
          <div class="text-sm">电影订阅</div>
        </div>
      </div>
      <div class="d-flex align-center">
        <VAvatar size="40" color="primary" rounded variant="tonal" class="me-4">
          <VIcon size="24" icon="mdi-television"></VIcon>
        </VAvatar>
        <div>
          <div class="text-h6">{{ tvShowSubscriptions }}</div>
          <div class="text-sm">电视剧订阅</div>
        </div>
      </div>
    </VCardText>
    <VCardText class="pb-6">
      <h5 class="text-h6">详情</h5>
      <VDivider class="my-2" />
      <VList lines="one">
        <VListItem>
          <VListItemTitle class="text-sm">
            <span class="font-weight-medium">邮箱：</span><span class="text-body-1"> {{ user.email }}</span>
          </VListItemTitle>
        </VListItem>
        <VListItem>
          <VListItemTitle class="text-sm">
            <span class="font-weight-medium">状态：</span
            ><span class="text-body-1">
              <VChip size="small" :class="{ 'text-success': user.is_active }" variant="tonal">
                {{ user.is_active ? '激活' : '已停用' }}
              </VChip>
            </span>
          </VListItemTitle>
        </VListItem>
      </VList>
    </VCardText>
    <VCardText class="flex flex-row justify-center">
      <VBtn color="primary" class="me-4">编辑</VBtn>
      <VBtn color="info" class="me-4" variant="outlined">权限</VBtn>
      <VBtn color="error" variant="outlined">删除</VBtn>
    </VCardText>
  </VCard>
</template>
