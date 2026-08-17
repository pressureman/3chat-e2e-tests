export type LoginAccount = {
  primary: string;
  retry?: string;
};

export type PasswordLoginAccount = {
  email: string;
  password: string;
};

export const testAccounts: {
  passwordLogin: Record<'cn' | 'intl', PasswordLoginAccount>;
  emailLogin: Record<'cn' | 'intl', LoginAccount>;
  phoneLogin: Record<'cn' | 'intl', LoginAccount>;
} = {
  passwordLogin: {
    cn: {
      email: process.env.ADD_SPACE_CN_LOGIN_ACCOUNT
        || process.env.CHANNEL_LINK_LOGIN_ACCOUNT
        || 'TestIgnored@qq.com',
      password: process.env.ADD_SPACE_CN_LOGIN_PASSWORD
        || process.env.CHANNEL_LINK_LOGIN_PASSWORD
        || '1qaz!QAZ',
    },
    intl: {
      email: process.env.ADD_SPACE_INTL_LOGIN_ACCOUNT
        || process.env.ADD_SPACE_CN_LOGIN_ACCOUNT
        || process.env.CHANNEL_LINK_LOGIN_ACCOUNT
        || 'TestIgnored@qq.com',
      password: process.env.ADD_SPACE_INTL_LOGIN_PASSWORD
        || process.env.ADD_SPACE_CN_LOGIN_PASSWORD
        || process.env.CHANNEL_LINK_LOGIN_PASSWORD
        || '1qaz!QAZ',
    },
  },

  emailLogin: {
    cn: {
      primary: 'test00000001@e2eTestEmail.com',
      retry: 'test00000002@e2eTestEmail.com',
    },
    intl: {
      primary: 'test00000003@e2eTestEmail.com',
      retry: 'test00000004@e2eTestEmail.com',
    },
  },

  phoneLogin: {
    cn: {
      primary: '15000000001',
      retry: '15000000002',
    },
    intl: {
      primary: '15000000003',
      retry: '15000000004',
    },
  },
};
