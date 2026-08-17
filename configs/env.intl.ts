import type { RuntimeEnv } from './env.cn';

export const intlEnv: RuntimeEnv = {
  version: 'intl',
  label: '国际版',
  homeUrl: process.env.ADD_SPACE_INTL_HOME_URL || 'https://www.3chat.ai/',
  appOrigin: 'https://app.3chat.ai',
  smsLog: {
    project: process.env.ALIYUN_SMS_LOG_PROJECT_INTL || 'k8s-log-c02e5f3e3e48a44ff9c7236b696573353',
    logstore: process.env.ALIYUN_SMS_LOGSTORE_INTL || 'prod-sg',
    env: 'INTERNATIONAL',
  },
  locale: {
    expected: 'en',
  },
};
