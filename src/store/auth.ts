import type { Module } from 'vuex'

// 定义状态类型
interface AuthState {
  token: string | null
  remember: boolean
  superUser: boolean
  userName: string
  avatar: string
  originalPath: string | null
  level: number
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
    level: 1,
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
    setOriginalPath(state, originalPath: string) {
      state.originalPath = originalPath
    },
    setLevel(state, level: number) {
      state.level = level
    },
  },
  actions: {
    login({ commit }, { token, remember, superUser, userName, avatar, level }) {
      commit('setToken', token)
      commit('setRemember', remember)
      commit('setSuperUser', superUser)
      commit('setUserName', userName)
      commit('setAvatar', avatar)
      commit('setLevel', level)
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
    getUserName: state => state.userName,
    getAvatar: state => state.avatar,
    getOriginalPath: state => state.originalPath,
    getLevel: state => state.level,
  },
}

export default authModule
