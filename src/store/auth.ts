import type { Module } from 'vuex'

// 定义状态类型
interface AuthState {
  token: string | null
  remember: boolean
  superUser: boolean
  userID: number
  userName: string
  avatar: string
  originalPath: string | null
  level: number
  permissions: { [key: string]: any }
}

// 定义根状态类型
interface RootState {
  auth: AuthState
}

// 用户信息模块
const authModule: Module<AuthState, RootState> = {
  namespaced: true,
  state: {
    token: null, // 用户令牌
    remember: false, // 记住我
    superUser: false, // 超级管理员
    userID: 999, // 用户ID
    userName: '', // 用户名
    avatar: '', // 头像
    originalPath: null, // 原始路径
    level: 1, // 用户认证等级 1-未认证 2-已认证
    permissions: {},
  },
  mutations: {
    setToken(state, token: string) {
      state.token = token
    },
    clearToken(state) {
      state.token = null
    },
    setRemember(state, remember: boolean) {
      state.remember = remember
    },
    setSuperUser(state, superUser: boolean) {
      state.superUser = superUser
    },
    setUserID(state, userID: number) {
      state.userID = userID
    },
    setUserName(state, userName: string) {
      state.userName = userName
    },
    setAvatar(state, avatar: string) {
      state.avatar = avatar
    },
    setOriginalPath(state, originalPath: string) {
      state.originalPath = originalPath
    },
    setLevel(state, level: number) {
      state.level = level
    },
    setPermissions(state, permissions: object) {
      state.permissions = permissions
    },
  },
  actions: {
    login({ commit }, { token, remember, superUser, userID, userName, avatar, level, permissions }) {
      commit('setToken', token)
      commit('setRemember', remember)
      commit('setSuperUser', superUser)
      commit('setUserID', userID)
      commit('setUserName', userName)
      commit('setAvatar', avatar)
      commit('setLevel', level)
      commit('setPermissions', permissions)
    },
    logout({ commit }) {
      commit('clearToken')
      commit('setOriginalPath', null)
    },
  },
  getters: {
    getToken: state => state.token,
    getRemember: state => state.remember,
    getSuperUser: state => state.superUser,
    getUserID: state => state.userID,
    getUserName: state => state.userName,
    getAvatar: state => state.avatar,
    getOriginalPath: state => state.originalPath,
    getLevel: state => state.level,
    getPermissions: state => state.permissions,
  },
}

export default authModule
