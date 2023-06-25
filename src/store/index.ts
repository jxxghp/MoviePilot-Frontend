import { ActionTree, GetterTree, MutationTree, createStore } from 'vuex';
import createPersistedState from 'vuex-persistedstate';

interface State {
  // 登录token
  token: string | null;
  // 是否记住登录状态
  remember: boolean;
}

const state: State = {
  token: null,
  remember: false,
};

const mutations: MutationTree<State> = {
  setToken(state, token: string) {
    state.token = token;
  },
  clearToken(state) {
    state.token = null;
  },
  setRemember(state, remember: boolean) {
    state.remember = remember;
  },
};

const actions: ActionTree<State, any> = {
  updateToken({ commit }, token: string) {
    commit('setToken', token);
  },
  clearToken({ commit },) {
    commit('clearToken');
  },
  updateRemember({ commit }, remember: boolean) {
    commit('setRemember', remember);
  },
};

const getters: GetterTree<State, any> = {
  getToken: state => state.token,
  getRemember: state => state.remember,
};

const store = createStore({
  state,
  mutations,
  actions,
  getters,
  plugins: [
    createPersistedState({
      // 配置持久化存储的选项
      storage: window.localStorage, // 使用 localStorage 存储状态
      key: 'moviepilot', // 存储的键名
    }),
  ],
});

export default store;
