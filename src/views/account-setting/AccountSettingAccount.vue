<script lang="ts" setup>
import { requiredValidator } from "@/@validators";
import api from "@/api";
import { User } from "@/api/types";
import avatar1 from "@images/avatars/avatar-1.png";
import { useToast } from "vue-toast-notification";
const isNewPasswordVisible = ref(false);
const isConfirmPasswordVisible = ref(false);
const isPasswordVisible = ref(false);
const newPassword = ref("");
const confirmPassword = ref("");

// 提示框
const $toast = useToast();

const refInputEl = ref<HTMLElement>();

// 新增用户窗口
const addUserDialog = ref(false);

// 新增用户表单
const userForm = reactive({
  name: "",
  password: "",
  email: "",
});

// 当前用户信息
const accountInfo = ref<User>({
  id: 0,
  name: "",
  password: "",
  email: "",
  is_active: false,
  is_superuser: false,
  avatar: "",
});

// 所有用户信息
const allUsers = ref<User[]>([]);

// changeAvatar function
const changeAvatar = (file: Event) => {
  const fileReader = new FileReader();
  const { files } = file.target as HTMLInputElement;

  if (files && files.length) {
    fileReader.readAsDataURL(files[0]);
    fileReader.onload = () => {
      if (typeof fileReader.result === "string")
        accountInfo.value.avatar = fileReader.result;
    };
  }
};

// reset avatar image
const resetAvatar = () => {
  accountInfo.value.avatar = avatar1;
};

// 调用API，加载当前用户数据
const loadAccountInfo = async () => {
  try {
    const user: User = await api.get(`user/current`);
    accountInfo.value = user;
    if (!accountInfo.value.avatar) accountInfo.value.avatar = avatar1;
  } catch (error) {
    console.log(error);
  }
};

// 保存用户信息
const saveAccountInfo = async () => {
  if (newPassword.value || confirmPassword.value) {
    if (newPassword.value !== confirmPassword.value) {
      $toast.error("两次输入的密码不一致");
      return;
    }
    accountInfo.value.password = newPassword.value;
  }
  try {
    const result: { [key: string]: any } = await api.put(`user`, accountInfo.value);
    if (result.success) {
      $toast.success("用户信息保存成功！");
    } else {
      $toast.error(`用户信息保存失败：${result.message}！`);
    }
  } catch (error) {
    console.log(error);
  }
};

// 调用API，查询所有用户
const loadAllUsers = async () => {
  try {
    const result: User[] = await api.get(`/user`);
    allUsers.value = result;
  } catch (error) {
    console.log(error);
  }
};

// 删除用户
const deleteUser = async (user: User) => {
  try {
    const result: { [key: string]: any } = await api.delete(`user/${user.name}`);
    if (result.success) {
      $toast.success("用户删除成功！");
      loadAllUsers();
    } else {
      $toast.error(`用户删除失败：${result.message}！`);
    }
  } catch (error) {
    console.log(error);
  }
};

// 冻结用户
const deactivateUser = async (user: User) => {
  try {
    user.is_active = !user.is_active;
    const result: { [key: string]: any } = await api.put(`user`, user);
    if (result.success) {
      $toast.success("用户冻结成功！");
      loadAllUsers();
    } else {
      $toast.error(`用户冻结失败：${result.message}！`);
    }
  } catch (error) {
    console.log(error);
  }
};

// 新增用户
const addUser = async () => {
  try {
    const result: { [key: string]: any } = await api.post(`user`, userForm);
    if (result.success) {
      $toast.success("用户新增成功！");
      loadAllUsers();
      addUserDialog.value = false;
    } else {
      $toast.error(`用户新增失败：${result.message}！`);
    }
  } catch (error) {
    console.log(error);
  }
};

// 加载当前用户数据
onMounted(() => {
  loadAccountInfo();
  loadAllUsers();
});
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="个人信息">
        <VCardText class="d-flex">
          <!-- 👉 Avatar -->
          <VAvatar rounded="lg" size="100" class="me-6" :image="accountInfo.avatar" />

          <!-- 👉 Upload Photo -->
          <form class="d-flex flex-column justify-center gap-5">
            <div class="d-flex flex-wrap gap-2">
              <VBtn color="primary" @click="refInputEl?.click()">
                <VIcon icon="mdi-cloud-upload-outline" class="d-sm-none" />
                <span class="d-none d-sm-block">上传头像</span>
              </VBtn>

              <input
                ref="refInputEl"
                type="file"
                name="file"
                accept=".jpeg,.png,.jpg,GIF"
                hidden
                @input="changeAvatar"
              />

              <VBtn type="reset" color="error" variant="tonal" @click="resetAvatar">
                <span class="d-none d-sm-block">重置</span>
                <VIcon icon="mdi-refresh" class="d-sm-none" />
              </VBtn>
            </div>

            <p class="text-body-1 mb-0">允许 JPG、GIF 或 PNG 格式， 最大尽寸 800K。</p>
          </form>
        </VCardText>

        <VDivider />

        <VCardText>
          <!-- 👉 Form -->
          <VForm class="mt-6">
            <VRow>
              <!-- 👉 Name -->
              <VCol md="6" cols="12">
                <VTextField readonly v-model="accountInfo.name" label="用户名" />
              </VCol>

              <!-- 👉 Email -->
              <VCol cols="12" md="6">
                <VTextField v-model="accountInfo.email" label="邮箱" type="email" />
              </VCol>

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

              <!-- 👉 Form Actions -->
              <VCol cols="12" class="d-flex flex-wrap gap-4">
                <VBtn @click="saveAccountInfo">保存</VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>

    <VCol cols="12" v-if="accountInfo.is_superuser">
      <!-- 👉 Accounts -->
      <VCard title="所有用户">
        <template #append>
          <IconBtn @click.stop="addUserDialog = true">
            <VIcon icon="mdi-plus" />
          </IconBtn>
        </template>
        <VTable class="text-no-wrap">
          <thead>
            <tr>
              <th scope="col">用户名</th>
              <th scope="col">邮箱</th>
              <th scope="col">状态</th>
              <th scope="col">管理员</th>
              <th scope="col" class="w-5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in allUsers" :key="user.name">
              <td>
                {{ user.name }}
              </td>
              <td>{{ user.email }}</td>
              <td>
                <VChip color="success" text-color="white" v-if="user.is_active"
                  >激活</VChip
                >
                <VChip color="error" text-color="white" v-else>冻结</VChip>
              </td>
              <td>{{ user.is_superuser ? "是" : "否" }}</td>
              <td>
                <IconBtn v-show="!user.is_superuser">
                  <VIcon icon="mdi-dots-vertical" />
                  <VMenu activator="parent">
                    <VList>
                      <VListItem variant="plain" @click.stop="deactivateUser(user)">
                        <template #prepend>
                          <VIcon icon="mdi-lock"></VIcon>
                        </template>
                        <VListItemTitle>{{
                          user.is_active ? "冻结" : "解冻"
                        }}</VListItemTitle>
                      </VListItem>
                      <VListItem
                        variant="plain"
                        base-color="error"
                        @click.stop="deleteUser(user)"
                      >
                        <template #prepend>
                          <VIcon icon="mdi-delete"></VIcon>
                        </template>
                        <VListItemTitle>删除</VListItemTitle>
                      </VListItem>
                    </VList>
                  </VMenu>
                </IconBtn>
              </td>
            </tr>
          </tbody>
        </VTable>
      </VCard>
    </VCol>
  </VRow>
  <!-- 站点编辑弹窗 -->
  <VDialog v-model="addUserDialog" max-width="800" persistent>
    <!-- Dialog Content -->
    <VCard title="新增用户">
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.name"
                label="用户名"
                :rules="[requiredValidator]"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="userForm.password"
                label="密码"
                :rules="[requiredValidator]"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="
                  isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                "
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField v-model="userForm.email" label="邮箱" />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions>
        <VBtn @click="addUserDialog = false"> 取消 </VBtn>
        <VSpacer />
        <VBtn @click="addUser"> 确定 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
