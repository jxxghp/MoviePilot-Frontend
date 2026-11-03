// 此文件由 build:plugin-sdk 自动生成，请修改 src/sdk/plugin.ts 或 src/types/agentHost.ts。
/** SDK 主版本；不兼容变更使用新的主版本和公开目录。 */
export const PLUGIN_HOST_SDK_VERSION = 1;
/** 字符串键可在宿主与独立构建的插件之间共享。 */
export const PLUGIN_HOST_SDK_KEY = 'moviepilot:sdk';
/** 兼容已有插件的独立能力注入键。 */
export const PLUGIN_HOST_KEYS = {
    toast: 'moviepilot:toast',
    dialog: 'moviepilot:dialog',
    confirm: 'moviepilot:confirm',
    nativeSubscribe: 'moviepilot:nativeSubscribe',
    subscriptionManager: 'moviepilot:subscriptionManager',
    agent: 'moviepilot:agent',
};
/** 宿主实际实现的现有订阅管理操作。 */
export const PLUGIN_SUBSCRIPTION_ACTIONS = [
    'edit',
    'search',
    'pause',
    'resume',
    'reset',
    'activity',
    'detail',
    'delete',
    'logs',
    'files',
    'execution',
    'share',
];
export function createPluginHostSDK(services) {
    const capabilities = ['api'];
    if (services.ui)
        capabilities.push('ui.toast', 'ui.dialog', 'ui.confirm');
    if (services.subscriptions?.create)
        capabilities.push('subscription.create');
    if (services.subscriptions?.manage) {
        capabilities.push('subscription.manage', ...PLUGIN_SUBSCRIPTION_ACTIONS.map(action => `subscription.manage.${action}`));
    }
    if (services.subscriptions?.createMusic)
        capabilities.push('subscription.create.music');
    for (const namespace of ['media', 'resources', 'files', 'catalogs']) {
        const service = services[namespace];
        if (service)
            for (const method of Object.keys(service)) {
                if (typeof service[method] === 'function')
                    capabilities.push(`${namespace}.${method}`);
            }
    }
    for (const namespace of ['navigation', 'environment', 'preferences', 'events', 'workflows']) {
        if (services[namespace])
            capabilities.push(namespace);
    }
    if (services.shell?.registerButton)
        capabilities.push('shell.button');
    if (services.shell?.registerTabs)
        capabilities.push('shell.tabs');
    if (services.agent)
        capabilities.push('agent');
    if (services.pet)
        capabilities.push('agent.pet');
    const available = new Set(capabilities);
    return Object.freeze({
        apiVersion: PLUGIN_HOST_SDK_VERSION,
        hostVersion: services.hostVersion,
        get context() {
            return Object.freeze({ ...services.context() });
        },
        get api() {
            return services.api();
        },
        capabilities: Object.freeze(capabilities),
        ui: services.ui ? Object.freeze({ ...services.ui }) : undefined,
        subscriptions: services.subscriptions ? Object.freeze({ ...services.subscriptions }) : undefined,
        media: services.media ? Object.freeze({ ...services.media }) : undefined,
        resources: services.resources ? Object.freeze({ ...services.resources }) : undefined,
        files: services.files ? Object.freeze({ ...services.files }) : undefined,
        catalogs: services.catalogs ? Object.freeze({ ...services.catalogs }) : undefined,
        navigation: services.navigation ? Object.freeze({ ...services.navigation }) : undefined,
        environment: services.environment ? Object.freeze({ ...services.environment }) : undefined,
        preferences: services.preferences ? Object.freeze({ ...services.preferences }) : undefined,
        events: services.events ? Object.freeze({ ...services.events }) : undefined,
        shell: services.shell ? Object.freeze({ ...services.shell }) : undefined,
        workflows: services.workflows ? Object.freeze({ ...services.workflows }) : undefined,
        agent: services.agent,
        pet: services.pet,
        supports: (capability) => available.has(capability),
    });
}
/** 识别可消费的 SDK 主版本；旧宿主或未知版本不能被当作 v1 调用。 */
export function isPluginHostSDK(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return (candidate.apiVersion === PLUGIN_HOST_SDK_VERSION &&
        typeof candidate.hostVersion === 'string' &&
        typeof candidate.supports === 'function' &&
        Array.isArray(candidate.capabilities) &&
        !!candidate.context &&
        typeof candidate.context.pluginId === 'string' &&
        !!candidate.api &&
        typeof candidate.api.get === 'function');
}
