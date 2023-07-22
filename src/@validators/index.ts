import type { ValidationRule } from 'vuetify/types/services/validation'

// 必输校验
export const requiredValidator: ValidationRule = (value: any) => !!value || '此项为必填项'

// 数字校验
export const numberValidator: ValidationRule = (value: any) => !isNaN(value) || '请输入数字'
