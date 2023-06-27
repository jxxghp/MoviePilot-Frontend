<template>
  <VCalendar ref="calendar" v-model="start" :type="type" :end="end" color="primary"></VCalendar>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const start = ref('2019-01-01');
const end = ref('2019-01-06');
const type = ref('month');
</script>
