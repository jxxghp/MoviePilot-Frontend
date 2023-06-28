import { ValidationRule } from 'vuetify/types/services/validation'

// 必输校验
export const requiredValidator: ValidationRule = (value: any) => !!value || '此项为必填项'
