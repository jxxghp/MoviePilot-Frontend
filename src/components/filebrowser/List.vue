<script>
import { formatBytes } from './util'
import Confirm from './Confirm.vue'

export default {
  components: {
    Confirm,
  },
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
      items: [],
      filter: '',
    }
  },
  computed: {
    dirs() {
      return this.items.filter(
        item =>
          item.type === 'dir' && item.basename.includes(this.filter),
      )
    },
    files() {
      return this.items.filter(
        item =>
          item.type === 'file' && item.basename.includes(this.filter),
      )
    },
    isDir() {
      return this.path[this.path.length - 1] === '/'
    },
    isFile() {
      return !this.isDir
    },
  },
  watch: {
    async path() {
      this.items = []
      await this.load()
    },
    async refreshPending() {
      if (this.refreshPending) {
        await this.load()
        this.$emit('refreshed')
      }
    },
  },
  methods: {
    formatBytes,
    changePath(path) {
      this.$emit('path-changed', path)
    },
    async load() {
      this.$emit('loading', true)
      if (this.isDir) {
        const url = this.endpoints.list.url
          .replace(new RegExp('{storage}', 'g'), this.storage)
          .replace(new RegExp('{path}', 'g'), this.path)

        const config = {
          url,
          method: this.endpoints.list.method || 'get',
        }

        const response = await this.axios.request(config)
        this.items = response.data
      }
      else {
        // TODO: load file
      }
      this.$emit('loading', false)
    },
    async deleteItem(item) {
      const confirmed = await this.$refs.confirm.open(
        'Delete',
                `Are you sure<br>you want to delete this ${
                    item.type === 'dir' ? 'folder' : 'file'
                }?<br><em>${item.basename}</em>`,
      )

      if (confirmed) {
        this.$emit('loading', true)
        const url = this.endpoints.delete.url
          .replace(new RegExp('{storage}', 'g'), this.storage)
          .replace(new RegExp('{path}', 'g'), item.path)

        const config = {
          url,
          method: this.endpoints.delete.method || 'post',
        }

        await this.axios.request(config)
        this.$emit('file-deleted')
        this.$emit('loading', false)
      }
    },
  },
}
</script>

<template>
  <v-card flat tile min-height="380" class="d-flex flex-column">
    <Confirm ref="confirm" />
    <v-card-text
      v-if="!path"
      class="grow d-flex justify-center align-center grey--text"
    >
      Select a folder or a file
    </v-card-text>
    <v-card-text
      v-else-if="isFile"
      class="grow d-flex justify-center align-center"
    >
      File: {{ path }}
    </v-card-text>
    <v-card-text v-else-if="dirs.length || files.length" class="grow">
      <v-list v-if="dirs.length" subheader>
        <v-subheader>Folders</v-subheader>
        <v-list-item
          v-for="item in dirs"
          :key="item.basename"
          class="pl-0"
          @click="changePath(item.path)"
        >
          <v-list-item-avatar class="ma-0">
            <v-icon>mdi-folder-outline</v-icon>
          </v-list-item-avatar>
          <v-list-item-content class="py-2">
            <v-list-item-title v-text="item.basename" />
          </v-list-item-content>
          <v-list-item-action>
            <v-btn icon @click.stop="deleteItem(item)">
              <v-icon color="grey lighten-1">
                mdi-delete-outline
              </v-icon>
            </v-btn>
            <v-btn v-if="false" icon>
              <v-icon color="grey lighten-1">
                mdi-information
              </v-icon>
            </v-btn>
          </v-list-item-action>
        </v-list-item>
      </v-list>
      <v-divider v-if="dirs.length && files.length" />
      <v-list v-if="files.length" subheader>
        <v-subheader>Files</v-subheader>
        <v-list-item
          v-for="item in files"
          :key="item.basename"
          class="pl-0"
          @click="changePath(item.path)"
        >
          <v-list-item-avatar class="ma-0">
            <v-icon>{{ icons[item.extension.toLowerCase()] || icons.other }}</v-icon>
          </v-list-item-avatar>

          <v-list-item-content class="py-2">
            <v-list-item-title v-text="item.basename" />
            <v-list-item-subtitle>{{ formatBytes(item.size) }}</v-list-item-subtitle>
          </v-list-item-content>

          <v-list-item-action>
            <v-btn icon @click.stop="deleteItem(item)">
              <v-icon color="grey lighten-1">
                mdi-delete-outline
              </v-icon>
            </v-btn>
            <v-btn v-if="false" icon>
              <v-icon color="grey lighten-1">
                mdi-information
              </v-icon>
            </v-btn>
          </v-list-item-action>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-text
      v-else-if="filter"
      class="grow d-flex justify-center align-center grey--text py-5"
    >
      No files or folders found
    </v-card-text>
    <v-card-text
      v-else
      class="grow d-flex justify-center align-center grey--text py-5"
    >
      The folder is empty
    </v-card-text>
    <v-divider v-if="path" />
    <v-toolbar v-if="false && path && isFile" dense flat class="shrink">
      <v-btn icon>
        <v-icon>mdi-download</v-icon>
      </v-btn>
    </v-toolbar>
    <v-toolbar v-if="path && isDir" dense flat class="shrink">
      <v-text-field
        v-model="filter"
        solo
        flat
        hide-details
        label="Filter"
        prepend-inner-icon="mdi-filter-outline"
        class="ml-n3"
      />
      <v-btn v-if="false" icon>
        <v-icon>mdi-eye-settings-outline</v-icon>
      </v-btn>
      <v-btn icon @click="load">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-toolbar>
  </v-card>
</template>

<style lang="scss" scoped>
.v-card {
    height: 100%;
}
</style>
