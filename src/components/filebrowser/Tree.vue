<script>
export default {
  props: {
    icons: Object,
    storage: String,
    path: String,
    endpoints: Object,
    axios: Function,
    refreshPending: Boolean,
  },
  data() {
    return {
      open: [],
      active: [],
      items: [],
      filter: '',
    }
  },
  watch: {
    storage() {
      this.init()
    },
    path() {
      this.active = [this.path]
      if (!this.open.includes(this.path))
        this.open.push(this.path)
    },
    async refreshPending() {
      if (this.refreshPending) {
        const item = this.findItem(this.path)
        await this.readFolder(item)
        this.$emit('refreshed')
      }
    },
  },
  created() {
    this.init()
  },
  methods: {
    init() {
      this.open = []
      this.items = []
      // set default files tree items (root item) in nextTick.
      // Otherwise this.open isn't cleared properly (due to syncing perhaps)
      setTimeout(() => {
        this.items = [
          {
            type: 'dir',
            path: '/',
            basename: 'root',
            extension: '',
            name: 'root',
            children: [],
          },
        ]
      }, 0)
      if (this.path !== '')
        this.$emit('path-changed', '')
    },
    async readFolder(item) {
      this.$emit('loading', true)
      const url = this.endpoints.list.url
        .replace(new RegExp('{storage}', 'g'), this.storage)
        .replace(new RegExp('{path}', 'g'), item.path)

      const config = {
        url,
        method: this.endpoints.list.method || 'get',
      }

      const response = await this.axios.request(config)

      item.children = response.data.map((item) => {
        if (item.type === 'dir')
          item.children = []

        return item
      })

      this.$emit('loading', false)
    },
    activeChanged(active) {
      this.active = active
      let path = ''
      if (active.length)
        path = active[0]

      if (this.path != path)
        this.$emit('path-changed', path)
    },
    findItem(path) {
      const stack = []
      stack.push(this.items[0])
      while (stack.length > 0) {
        const node = stack.pop()
        if (node.path == path) {
          return node
        }
        else if (node.children && node.children.length) {
          for (let i = 0; i < node.children.length; i++)
            stack.push(node.children[i])
        }
      }
      return null
    },
  },
}
</script>

<template>
  <v-card flat tile width="250" min-height="380" class="d-flex flex-column folders-tree-card">
    <div class="grow scroll-x">
      <v-treeview
        :open="open"
        :active="active"
        :items="items"
        :search="filter"
        :load-children="readFolder"
        item-key="path"
        item-text="basename"
        dense
        activatable
        transition
        class="folders-tree"
        @update:active="activeChanged"
      >
        <template #prepend="{ item, open }">
          <v-icon
            v-if="item.type === 'dir'"
          >
            {{ open ? 'mdi-folder-open-outline' : 'mdi-folder-outline' }}
          </v-icon>
          <v-icon v-else>
            {{ icons[item.extension.toLowerCase()] || icons.other }}
          </v-icon>
        </template>
        <template #label="{ item }">
          {{ item.basename }}
          <v-btn
            v-if="item.type === 'dir'"
            icon
            class="ml-1"
            @click.stop="readFolder(item)"
          >
            <v-icon class="pa-0 mdi-18px" color="grey lighten-1">
              mdi-refresh
            </v-icon>
          </v-btn>
        </template>
      </v-treeview>
    </div>
    <v-divider />
    <v-toolbar dense flat class="shrink">
      <v-text-field
        v-model="filter"
        solo
        flat
        hide-details
        label="Filter"
        prepend-inner-icon="mdi-filter-outline"
        class="ml-n3"
      />
      <v-tooltip top>
        <template #activator="{ on }">
          <v-btn icon @click="init" v-on="on">
            <v-icon>mdi-collapse-all-outline</v-icon>
          </v-btn>
        </template>
        <span>Collapse All</span>
      </v-tooltip>
    </v-toolbar>
  </v-card>
</template>

<style lang="scss" scoped>
.folders-tree-card {
    height: 100%;

    .scroll-x {
        overflow-x: auto;
    }

    ::v-deep .folders-tree {
        width: fit-content;
        min-width: 250px;

        .v-treeview-node {
            cursor: pointer;

            &:hover {
                background-color: rgba(0, 0, 0, 0.02);
            }
        }
    }
}
</style>
