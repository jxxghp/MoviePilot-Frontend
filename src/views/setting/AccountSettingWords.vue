<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'

// 提示框
const $toast = useToast()

// 自定义识别词
const customIdentifiers = ref('')

// 自定义制作组
const customReleaseGroups = ref('')

// 自定义占位符
const customization = ref('')

// 文件整理屏蔽词
const transferExcludeWords = ref('')

// 查询已设置的识别词
async function queryCustomIdentifiers() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/CustomIdentifiers')
    if (result && result.data && result.data.value) customIdentifiers.value = result.data.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 查询已设置的制作组
async function queryCustomReleaseGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/CustomReleaseGroups')
    if (result && result.data && result.data.value) customReleaseGroups.value = result.data.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 查询已设置的自定义占位符
async function queryCustomization() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Customization')
    if (result && result.data && result.data.value) customization.value = result.data?.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 查询已设置的屏蔽词
async function queryTransferExcludeWords() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/TransferExcludeWords')
    if (result && result.data && result.data.value) transferExcludeWords.value = result.data?.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 保存用户设置的识别词
async function saveCustomIdentifiers() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      'system/setting/CustomIdentifiers',
      customIdentifiers.value.split('\n'),
    )

    if (result.success) $toast.success('自定义识别词保存成功')
    else $toast.error('自定义识别词保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 保存自定义制作组
async function saveCustomReleaseGroups() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      'system/setting/CustomReleaseGroups',
      customReleaseGroups.value.split('\n'),
    )

    if (result.success) $toast.success('自定义制作组/字幕组保存成功')
    else $toast.error('自定义制作组/字幕组保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 保存自定义占位符
async function saveCustomization() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      'system/setting/Customization',
      customization.value.split('\n'),
    )

    if (result.success) $toast.success('自定义占位符保存成功')
    else $toast.error('自定义占位符保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 保存文件整理屏蔽词
async function saveTransferExcludeWords() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      'system/setting/TransferExcludeWords',
      transferExcludeWords.value.split('\n'),
    )

    if (result.success) $toast.success('文件整理屏蔽词保存成功')
    else $toast.error('文件整理屏蔽词保存失败！')
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  queryCustomIdentifiers()
  queryCustomReleaseGroups()
  queryCustomization()
  queryTransferExcludeWords()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>自定义识别词</VCardTitle>
          <VCardSubtitle> 添加规则对种子名或者文件名进行预处理以校正识别。 </VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="customIdentifiers"
            auto-grow
            placeholder="支持正则表达式，特殊字符需要\转义，一行为一组"
            hint="支持正则表达式，特殊字符需要\转义，一行为一组"
            persistent-hint
          />
        </VCardText>
        <VCardText>
          <VAlert type="info" variant="tonal" title="支持的配置格式（注意空格）：">
            <span
              v-html="
                `
              屏蔽词<br>
              被替换词 => 替换词<br>
              前定位词 <> 后定位词 >> 集偏移量（EP）<br>
              被替换词 => 替换词 && 前定位词 <> 后定位词 >> 集偏移量（EP）<br>
              其中替换词支持格式：{[tmdbid/doubanid=xxx;type=movie/tv;s=xxx;e=xxx]} 直接指定TMDBID/豆瓣ID识别，其中s、e为季数和集数（可选）<br>
              `
              "
            />
          </VAlert>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveCustomIdentifiers"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>自定义制作组/字幕组</VCardTitle>
          <VCardSubtitle> 添加无法识别的制作组/字幕组。 </VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="customReleaseGroups"
            auto-grow
            placeholder="支持正则表达式，特殊字符需要\转义，一行代表一个制作组/字幕组"
            hint="支持正则表达式，特殊字符需要\转义，一行代表一个制作组/字幕组"
            persistent-hint
          />
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveCustomReleaseGroups"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>自定义占位符</VCardTitle>
          <VCardSubtitle> 添加自定义占位符识别正则，重命名格式中添加{customization}使用。 </VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="customization"
            auto-grow
            placeholder="支持正则表达式，特殊字符需要\转义，多个匹配对象请换行分隔"
            hint="支持正则表达式，特殊字符需要\转义，多个匹配对象请换行分隔"
            persistent-hint
          />
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveCustomization"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>文件整理屏蔽词</VCardTitle>
          <VCardSubtitle> 目录名或文件名中包含屏蔽词时不进行整理。 </VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="transferExcludeWords"
            auto-grow
            placeholder="支持正则表达式，特殊字符需要\转义，一行代表一个屏蔽词"
            hint="支持正则表达式，特殊字符需要\转义，一行代表一个屏蔽词"
            persistent-hint
          />
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveTransferExcludeWords"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
