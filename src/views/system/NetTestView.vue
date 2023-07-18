<script setup lang="ts">
import avatar1 from "@images/avatars/avatar-1.png";
import avatar2 from "@images/avatars/avatar-2.png";
import avatar3 from "@images/avatars/avatar-3.png";
import avatar4 from "@images/avatars/avatar-4.png";

interface Status {
  Online: string;
  Away: string;
  Offline: string;
  "In Meeting": string;
}

interface Users {
  avatar: string;
  name: string;
  status: keyof Status;
  lastVisited: string;
}

const users: Users[] = [
  {
    avatar: avatar1,
    name: "Caroline Black",
    status: "Online",
    lastVisited: "13 minutes ago",
  },
  {
    avatar: avatar2,
    name: "Alfred Copeland",
    status: "Away",
    lastVisited: "11 minutes ago",
  },
  {
    avatar: avatar3,
    name: "Celia Schneider",
    status: "Offline",
    lastVisited: "9 minutes ago",
  },
  {
    avatar: avatar4,
    name: "Max Rogan",
    status: "In Meeting",
    lastVisited: "28 minutes ago",
  },
];

const resolveStatusColor: Status = {
  Online: "success",
  Away: "warning",
  Offline: "secondary",
  "In Meeting": "error",
};
</script>

<template>
  <VList lines="two" border rounded>
    <template v-for="(user, index) of users" :key="user.name">
      <VListItem>
        <template #prepend>
          <VAvatar :image="user.avatar" />
        </template>
        <VListItemTitle>
          {{ user.name }}
        </VListItemTitle>
        <VListItemSubtitle class="mt-1 me-2">
          <VBadge
            dot
            location="start center"
            offset-x="2"
            :color="resolveStatusColor[user.status]"
            class="me-3"
          >
            <span class="ms-4">{{ user.status }}</span>
          </VBadge>

          <span class="text-xs text-wrap text-disabled">{{ user.lastVisited }}</span>
        </VListItemSubtitle>

        <template #append>
          <VBtn size="small"> Add </VBtn>
        </template>
      </VListItem>
      <VDivider v-if="index !== users.length - 1" />
    </template>
  </VList>
</template>
