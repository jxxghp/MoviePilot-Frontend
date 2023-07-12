<script lang="ts" setup>
interface Props {
  menuList?: unknown[]
  itemProps?: boolean
}

const props = defineProps<Props>()
</script>

<template>
  <IconBtn>
    <VIcon icon="mdi-dots-vertical" />

    <VMenu
      v-if="props.menuList"
      activator="parent"
      close-on-content-click
    >
      <VList
        :items="props.menuList"
        :item-props="props.itemProps"
      />
    </VMenu>
  </IconBtn>
</template>
