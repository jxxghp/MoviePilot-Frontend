<script>
import { formatBytes } from './util'

const imageMimeTypes = ['image/png', 'image/jpeg']

export default {
  props: {
    path: String,
    storage: String,
    endpoint: Object,
    files: { type: Array, default: () => [] },
    icons: Object,
    axios: Function,
    maxUploadFilesCount: { type: Number, default: 0 },
    maxUploadFileSize: { type: Number, default: 0 },
  },
  data() {
    return {
      loading: false,
      uploading: false,
      progress: 0,
      listItems: [],
    }
  },
  watch: {
    files: {
      deep: true,
      immediate: true,
      async handler() {
        this.loading = true
        this.listItems = await this.filesMap(this.files)
        this.loading = false
      },
    },
  },
  methods: {
    formatBytes,

    async filesMap(files) {
      const promises = Array.from(files).map((file) => {
        const result = {
          name: file.name,
          type: file.type,
          size: file.size,
          extension: file.name.split('.').pop(),
        }
        return new Promise((resolve) => {
          if (!imageMimeTypes.includes(result.type))
            return resolve(result)

          const reader = new FileReader()
          reader.onload = function (e) {
            result.preview = e.target.result
            resolve(result)
          }
          reader.readAsDataURL(file)
        })
      })

      return await Promise.all(promises)
    },

    async add(event) {
      const files = Array.from(event.target.files)
      this.$emit('add-files', files)
      this.$refs.inputUpload.value = ''
    },

    remove(index) {
      this.$emit('remove-file', index)
      this.listItems.splice(index, 1)
    },

    clear() {
      this.$emit('clear-files')
      this.listItems = []
    },

    cancel() {
      this.$emit('cancel')
    },

    async upload() {
      const formData = new FormData()

      // files
      for (const file of this.files)
        formData.append('files', file, file.name)

      const url = this.endpoint.url
        .replace(new RegExp('{storage}', 'g'), this.storage)
        .replace(new RegExp('{path}', 'g'), this.path)

      const config = {
        url,
        method: this.endpoint.method || 'post',
        data: formData,
        onUploadProgress: (progressEvent) => {
          this.progress
                        = (progressEvent.loaded / progressEvent.total) * 100
        },
      }

      this.uploading = true
      const response = await this.axios.request(config)
      this.uploading = false
      this.$emit('uploaded')
    },
  },
}
</script>

<template>
  <v-overlay :absolute="true">
    <v-card flat light class="mx-auto" :loading="loading">
      <v-card-text class="py-3 text-center">
        <div>
          <span class="grey--text">Upload to:</span>
          <v-chip color="info" class="mx-1">
            {{ storage }}
          </v-chip>
          <v-chip>{{ path }}</v-chip>
        </div>
        <div v-if="maxUploadFilesCount">
          <span class="grey--text">Max files count: {{ maxUploadFilesCount }}</span>
        </div>
        <div v-if="maxUploadFileSize">
          <span class="grey--text">Max file size: {{ formatBytes(maxUploadFileSize) }}</span>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-text v-if="listItems.length" class="pa-0 files-list-wrapper">
        <v-list v-if="listItems.length" two-line>
          <v-list-item v-for="(file, index) in listItems" :key="index" link>
            <v-list-item-avatar>
              <v-img v-if="file.preview" :src="file.preview" />
              <v-icon
                v-else
                class="mdi-36px"
                color="grey lighten-1"
                v-text="icons[file.extension] || 'mdi-file'"
              />
            </v-list-item-avatar>
            <v-list-item-content>
              <v-list-item-title v-text="file.name" />
              <v-list-item-subtitle>{{ formatBytes(file.size) }} - {{ file.type }}</v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action>
              <v-btn icon @click="remove(index)">
                <v-icon color="grey lighten-1">
                  mdi-close
                </v-icon>
              </v-btn>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-text v-else class="py-6 text-center">
        <v-btn @click="$refs.inputUpload.click()">
          <v-icon left>
            mdi-plus-circle
          </v-icon>Add files
        </v-btn>
      </v-card-text>
      <v-divider />
      <v-toolbar dense flat>
        <div class="grow" />
        <v-btn text class="mx-1" @click="cancel">
          Cancel
        </v-btn>
        <v-btn depressed color="warning" class="mx-1" :disabled="!files" @click="clear">
          <v-icon>mdi-close</v-icon>Clear
        </v-btn>
        <v-btn
          :disabled="listItems.length >= maxUploadFilesCount"
          depressed
          color="info"
          class="mx-1"
          @click="$refs.inputUpload.click()"
        >
          <v-icon left>
            mdi-plus-circle
          </v-icon>Add Files
          <input
            v-show="false"
            ref="inputUpload"
            type="file"
            multiple
            @change="add"
          >
        </v-btn>
        <v-btn depressed color="success" class="ml-1" :disabled="!files" @click="upload">
          Upload
          <v-icon right>
            mdi-upload-outline
          </v-icon>
        </v-btn>
      </v-toolbar>
      <v-overlay :value="uploading" :absolute="true" color="white" opacity="0.9">
        <v-progress-linear v-model="progress" height="25" striped rounded reactive>
          <strong>{{ Math.ceil(progress) }}%</strong>
        </v-progress-linear>
      </v-overlay>
    </v-card>
  </v-overlay>
</template>

<style lang="scss" scoped>
::v-deep .v-overlay__content {
    width: 90%;
    max-width: 500px;

    .files-list-wrapper {
        max-height: 250px;
        overflow-y: auto;
    }
}
</style>
