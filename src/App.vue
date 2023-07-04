<script lang="ts" setup>
import { useToast } from "vue-toast-notification";
import store from "./store";

const route = useRoute();
const $toast = useToast();

onMounted(() => {
  const token = store.state.auth.token;
  if (token) {
    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_BASE_URL}system/message?token=${token}`
    );

    eventSource.addEventListener("message", (event) => {
      const message = event.data;
      $toast.info(message);
    });

    onBeforeUnmount(() => {
      eventSource.close();
    });
  }
});
</script>

<template>
  <VApp>
    <RouterView :key="route.fullPath" />
  </VApp>
</template>
