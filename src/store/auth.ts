import type { Module } from 'vuex'

// 定义状态类型
interface AuthState {
  token: string | null
  remember: boolean
  superUser: boolean
  userName: string
  avatar: string
  originalPath: string | null
}

// 定义根状态类型
interface RootState {
  auth: AuthState
}

// 导出模块
const authModule: Module<AuthState, RootState> = {
  namespaced: true,
  state: {
    token: null,
    remember: false,
    superUser: false,
    userName: '',
    avatar: '',
    originalPath: null,
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
    setUserName(state, userName: string) {
      state.userName = userName
    },
    setAvatar(state, avatar: string) {
      state.avatar = avatar
    },
  },
  actions: {
    updateToken({ commit }, token: string) {
      commit('setToken', token)
    },
    clearToken({ commit }) {
      commit('clearToken')
    },
    updateRemember({ commit }, remember: boolean) {
      commit('setRemember', remember)
    },
    updateSuperUser({ commit }, superUser: boolean) {
      commit('setSuperUser', superUser)
    },
    updateUserName({ commit }, userName: string) {
      commit('setUserName', userName)
    },
    updateAvatar({ commit }, avatar: string) {
      commit('setAvatar', avatar)
    },
  },
  getters: {
    getToken: state => state.token,
    getRemember: state => state.remember,
    getSuperUser: state => state.superUser,
    getUserName: state => state.userName,
    getAvatar: state => state.avatar,
  },
}

export default authModule
