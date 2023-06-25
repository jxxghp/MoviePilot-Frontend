import { Module } from 'vuex';

// 定义状态类型
interface AuthState {
  token: string | null;
  remember: boolean;
}

// 定义根状态类型
interface RootState {
  auth: AuthState;
}


// 导出模块
const authModule: Module<AuthState, RootState> = {
  namespaced: true,
  state: {
    token: null,
    remember: false,
  },
  mutations: {
    setToken(state, token: string) {
      state.token = token;
    },
    clearToken(state) {
      state.token = null;
    },
    setRemember(state, remember: boolean) {
      state.remember = remember;
    },
  },
  actions: {
    updateToken({ commit }, token: string) {
      commit('setToken', token);
    },
    clearToken({ commit },) {
      commit('clearToken');
    },
    updateRemember({ commit }, remember: boolean) {
      commit('setRemember', remember);
    },
  },
  getters: {
    getToken: state => state.token,
    getRemember: state => state.remember,
  }
};

export default authModule;
