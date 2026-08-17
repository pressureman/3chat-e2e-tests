export type RuntimeEnv = {
  version: 'cn' | 'intl';
  label: '国内版' | '国际版';
  homeUrl: string;
  appOrigin: string;
  smsLog: {
    endpoint?: string;
    project: string;
    logstore: string;
    env: 'MAINLAND' | 'INTERNATIONAL';
  };
  locale: {
    expected: 'zh-CN' | 'en';
  };
  loginMethod?: 'password' | 'phone' | 'email';
  registerType?: 'email' | 'phone';
  reportKey?: string;
};

export const cnEnv: RuntimeEnv = {
  version: 'cn',
  label: '国内版',
  homeUrl: process.env.ADD_SPACE_CN_HOME_URL
    || process.env.CHANNEL_LINK_HOME_URL
    || 'https://www.3chatai.cn/',
  appOrigin: 'https://app.3chatai.cn',
  smsLog: {
    project: process.env.ALIYUN_SMS_LOG_PROJECT || 'xinheyun-prod',
    logstore: process.env.ALIYUN_SMS_LOGSTORE || 'prod',
    env: 'MAINLAND',
  },
  locale: {
    expected: 'zh-CN',
  },
};
