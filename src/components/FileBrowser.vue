<script>
import axios from 'axios'

import Toolbar from './filebrowser/Toolbar.vue'
import Tree from './filebrowser/Tree.vue'
import List from './filebrowser/List.vue'
import Upload from './filebrowser/Upload.vue'

const availableStorages = [
  {
    name: 'Local',
    code: 'local',
    icon: 'mdi-folder-multiple-outline',
  },
]

const endpoints = {
  list: { url: '/storage/{storage}/list?path={path}', method: 'get' },
  upload: { url: '/storage/{storage}/upload?path={path}', method: 'post' },
  mkdir: { url: '/storage/{storage}/mkdir?path={path}', method: 'post' },
  delete: { url: '/storage/{storage}/delete?path={path}', method: 'post' },
}

const fileIcons = {
  zip: 'mdi-folder-zip-outline',
  rar: 'mdi-folder-zip-outline',
  htm: 'mdi-language-html5',
  html: 'mdi-language-html5',
  js: 'mdi-nodejs',
  json: 'mdi-json',
  md: 'mdi-markdown',
  pdf: 'mdi-file-pdf',
  png: 'mdi-file-image',
  jpg: 'mdi-file-image',
  jpeg: 'mdi-file-image',
  mp4: 'mdi-filmstrip',
  mkv: 'mdi-filmstrip',
  avi: 'mdi-filmstrip',
  wmv: 'mdi-filmstrip',
  mov: 'mdi-filmstrip',
  txt: 'mdi-file-document-outline',
  xls: 'mdi-file-excel',
  other: 'mdi-file-outline',
}

export default {
  components: {
    Toolbar,
    Tree,
    List,
    Upload,
  },
  model: {
    prop: 'path',
    event: 'change',
  },
  props: {
    // comma-separated list of active storage codes
    storages: {
      type: String,
      default: () => availableStorages.map(item => item.code).join(','),
    },
    // code of default storage
    storage: { type: String, default: 'local' },
    // show tree view
    tree: { type: Boolean, default: true },
    // file icons set
    icons: { type: Object, default: () => fileIcons },
    // custom backend endpoints
    endpoints: { type: Object, default: () => endpoints },
    // custom axios instance
    axios: { type: Function },
    // custom configuration for internal axios instance
    axiosConfig: { type: Object, default: () => {} },
    // max files count to upload at once. Unlimited by default
    maxUploadFilesCount: { type: Number, default: 0 },
    // max file size to upload. Unlimited by default
    maxUploadFileSize: { type: Number, default: 0 },
  },
  data() {
    return {
      loading: 0,
      path: '',
      activeStorage: null,
      uploadingFiles: false, // or an Array of files
      refreshPending: false,
      axiosInstance: null,
    }
  },
  computed: {
    storagesArray() {
      const storageCodes = this.storages.split(',')
      const result = []
      storageCodes.forEach((code) => {
        result.push(availableStorages.find(item => item.code == code))
      })
      return result
    },
  },
  created() {
    this.activeStorage = this.storage
    this.axiosInstance = this.axios || axios.create(this.axiosConfig)
  },
  mounted() {
    if (!this.path && !(this.tree && this.$vuetify.breakpoint.smAndUp))
      this.pathChanged('/')
  },
  methods: {
    loadingChanged(loading) {
      if (loading)
        this.loading++
      else if (this.loading > 0)
        this.loading--
    },
    storageChanged(storage) {
      this.activeStorage = storage
    },
    addUploadingFiles(files) {
      files = Array.from(files)

      if (this.maxUploadFileSize) {
        files = files.filter(
          file => file.size <= this.maxUploadFileSize,
        )
      }

      if (this.uploadingFiles === false)
        this.uploadingFiles = []

      if (this.maxUploadFilesCount && this.uploadingFiles.length + files.length > this.maxUploadFilesCount)
        files = files.slice(0, this.maxUploadFilesCount - this.uploadingFiles.length)

      this.uploadingFiles.push(...files)
    },
    removeUploadingFile(index) {
      this.uploadingFiles.splice(index, 1)
    },
    uploaded() {
      this.uploadingFiles = false
      this.refreshPending = true
    },
    pathChanged(path) {
      this.path = path
      this.$emit('change', path)
    },
  },
}
</script>

<template>
  <v-card class="mx-auto" :loading="loading > 0">
    <Toolbar
      :path="path"
      :storages="storagesArray"
      :storage="activeStorage"
      :endpoints="endpoints"
      :axios="axiosInstance"
      @storage-changed="storageChanged"
      @path-changed="pathChanged"
      @add-files="addUploadingFiles"
      @folder-created="refreshPending = true"
    />
    <v-row no-gutters>
      <v-col v-if="tree && $vuetify.breakpoint.smAndUp" sm="auto">
        <Tree
          :path="path"
          :storage="activeStorage"
          :icons="icons"
          :endpoints="endpoints"
          :axios="axiosInstance"
          :refresh-pending="refreshPending"
          @path-changed="pathChanged"
          @loading="loadingChanged"
          @refreshed="refreshPending = false"
        />
      </v-col>
      <v-divider v-if="tree" vertical />
      <v-col>
        <List
          :path="path"
          :storage="activeStorage"
          :icons="icons"
          :endpoints="endpoints"
          :axios="axiosInstance"
          :refresh-pending="refreshPending"
          @path-changed="pathChanged"
          @loading="loadingChanged"
          @refreshed="refreshPending = false"
          @file-deleted="refreshPending = true"
        />
      </v-col>
    </v-row>
    <Upload
      v-if="uploadingFiles !== false"
      :path="path"
      :storage="activeStorage"
      :files="uploadingFiles"
      :icons="icons"
      :axios="axiosInstance"
      :endpoint="endpoints.upload"
      :max-upload-files-count="maxUploadFilesCount"
      :max-upload-file-size="maxUploadFileSize"
      @add-files="addUploadingFiles"
      @remove-file="removeUploadingFile"
      @clear-files="uploadingFiles = []"
      @cancel="uploadingFiles = false"
      @uploaded="uploaded"
    />
  </v-card>
</template>

<style lang="scss" scoped>
</style>
