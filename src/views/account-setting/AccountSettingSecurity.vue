<script lang="ts" setup>
const isCurrentPasswordVisible = ref(false);
const isNewPasswordVisible = ref(false);
const isConfirmPasswordVisible = ref(false);
const currentPassword = ref("12345678");
const newPassword = ref("87654321");
const confirmPassword = ref("87654321");

const recentDevices = [
  {
    browser: "Chrome on Windows",
    device: "HP Spectre 360",
    location: "New York, NY",
    recentActivity: "28 Apr 2022, 18:20",
    deviceIcon: { icon: "mdi-microsoft-windows", color: "primary" },
  },
  {
    browser: "Chrome on iPhone",
    device: "iPhone 12x",
    location: "Los Angeles, CA",
    recentActivity: "20 Apr 2022, 10:20",
    deviceIcon: { icon: "mdi-cellphone", color: "error" },
  },
  {
    browser: "Chrome on Android",
    device: "Oneplus 9 Pro",
    location: "San Francisco, CA",
    recentActivity: "16 Apr 2022, 04:20",
    deviceIcon: { icon: "mdi-android", color: "success" },
  },
  {
    browser: "Chrome on MacOS",
    device: "Apple iMac",
    location: "New York, NY",
    recentActivity: "28 Apr 2022, 18:20",
    deviceIcon: { icon: "mdi-apple", color: "secondary" },
  },
  {
    browser: "Chrome on Windows",
    device: "HP Spectre 360",
    location: "Los Angeles, CA",
    recentActivity: "20 Apr 2022, 10:20",
    deviceIcon: { icon: "mdi-microsoft-windows", color: "primary" },
  },
  {
    browser: "Chrome on Android",
    device: "Oneplus 9 Pro",
    location: "San Francisco, CA",
    recentActivity: "16 Apr 2022, 04:20",
    deviceIcon: { icon: "mdi-android", color: "success" },
  },
];
</script>

<template>
  <VRow>
    <!-- SECTION: Change Password -->
    <VCol cols="12">
      <VCard title="修改密码">
        <VForm>
          <VCardText>
            <!-- 👉 Current Password -->
            <VRow class="mb-3">
              <VCol cols="12" md="6">
                <!-- 👉 current password -->
                <VTextField
                  v-model="currentPassword"
                  :type="isCurrentPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="
                    isCurrentPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                  "
                  label="原密码"
                  @click:append-inner="
                    isCurrentPasswordVisible = !isCurrentPasswordVisible
                  "
                />
              </VCol>
            </VRow>

            <!-- 👉 New Password -->
            <VRow>
              <VCol cols="12" md="6">
                <!-- 👉 new password -->
                <VTextField
                  v-model="newPassword"
                  :type="isNewPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="
                    isNewPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                  "
                  label="新密码"
                  @click:append-inner="isNewPasswordVisible = !isNewPasswordVisible"
                />
              </VCol>

              <VCol cols="12" md="6">
                <!-- 👉 confirm password -->
                <VTextField
                  v-model="confirmPassword"
                  :type="isConfirmPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="
                    isConfirmPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                  "
                  label="确认新密码"
                  @click:append-inner="
                    isConfirmPasswordVisible = !isConfirmPasswordVisible
                  "
                />
              </VCol>
            </VRow>
          </VCardText>

          <!-- 👉 Action Buttons -->
          <VCardText class="d-flex flex-wrap gap-4">
            <VBtn> 保存 </VBtn>

            <VBtn type="reset" color="secondary" variant="tonal"> 重置 </VBtn>
          </VCardText>
        </VForm>
      </VCard>
    </VCol>
    <!-- !SECTION -->

    <VCol cols="12">
      <!-- SECTION: Create an API key -->
      <VCard title="安全密钥">
        <VRow>
          <!-- 👉 Choose API Key -->
          <VCol cols="12" md="5" order-md="0" order="1">
            <VCardText>
              <VForm @submit.prevent="() => {}">
                <VRow>
                  <!-- 👉 Name the API Key -->
                  <VCol cols="12">
                    <VTextField label="Name the API key" />
                  </VCol>

                  <!-- 👉 Create Key Button -->
                  <VCol cols="12">
                    <VBtn type="submit" block> 保存 </VBtn>
                  </VCol>
                </VRow>
              </VForm>
            </VCardText>
          </VCol>
        </VRow>
      </VCard>
      <!-- !SECTION -->
    </VCol>

    <!-- SECTION Recent Devices -->
    <VCol cols="12">
      <!-- 👉 Table -->
      <VCard title="最近活跃设备">
        <VTable class="text-no-wrap">
          <thead>
            <tr>
              <th scope="col">浏览器</th>
              <th scope="col">设备</th>
              <th scope="col">地点</th>
              <th scope="col">最后活动时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="device in recentDevices" :key="device.recentActivity">
              <td>
                <VIcon
                  start
                  :icon="device.deviceIcon.icon"
                  :color="device.deviceIcon.color"
                />
                {{ device.browser }}
              </td>
              <td>{{ device.device }}</td>
              <td>{{ device.location }}</td>
              <td>{{ device.recentActivity }}</td>
            </tr>
          </tbody>
        </VTable>
      </VCard>
    </VCol>
    <!-- !SECTION -->
  </VRow>
</template>
