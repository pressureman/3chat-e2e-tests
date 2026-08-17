import type { RiskLevel, Version } from '../scenarios/types';

export type ChannelExpectedType =
  | 'internal-navigation'
  | 'external-navigation'
  | 'modal-then-navigation'
  | 'not-supported'
  | 'visible-only';

export interface ChannelExpectedBehavior {
  enabled: boolean;
  expectedType: ChannelExpectedType;
  expectedUrl?: string;
  expectedPath?: string;
  expectedOrigin?: string;
  allowExtraQuery?: boolean;
  optional?: boolean;
  defaultRiskLevel?: RiskLevel;
}

export interface ChannelRule {
  id: string;
  zhName: string;
  enName?: string;
  aliases?: string[];
  category?: 'core' | 'secondary' | 'domestic-only' | 'intl-only';
  versions: {
    cn?: ChannelExpectedBehavior;
    intl?: ChannelExpectedBehavior;
  };
}

type LegacyExpectedType = '站内跳转' | '前往国内版' | '前往国际版' | '弹窗后站内跳转' | '弹窗后前往国内版';

type LegacyRule = {
  id: string;
  zhName: string;
  enName: string;
  aliases?: string[];
  category?: ChannelRule['category'];
  domesticResult: LegacyExpectedType;
  domesticUrl: string;
  internationalResult: LegacyExpectedType;
  internationalUrl: string;
};

const coreChannelIds = new Set(['custom-website', 'shopify', 'wechat', 'wechat-customer-service', 'whatsapp', 'facebook', 'instagram']);

const legacyRules: LegacyRule[] = [
  { id: 'custom-website', zhName: '自定义官网', enName: 'Custom Website', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/channels/livechat/installation/website', internationalResult: '站内跳转', internationalUrl: '/embedded-app/subapp?url=/butler/channels/livechat/installation/website' },
  { id: 'shopify', zhName: 'Shopify', enName: 'Shopify', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/shopifyInstall', internationalResult: '站内跳转', internationalUrl: '/embedded-app/subapp?url=/butler/shopifyInstall' },
  { id: 'shopline', zhName: 'Shopline', enName: 'Shopline', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/shoplineInstall', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'wechat', zhName: '微信', enName: 'WebChat', aliases: ['WeChat', '微信个人号', '个人微信'], domesticResult: '弹窗后站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/chatperson', internationalResult: '弹窗后前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'wechat-customer-service', zhName: '微信客服', enName: 'WeChat Customer Service', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/channels/livechat/installation/qywechat', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'wechat-service-account', zhName: '微信服务号', enName: 'WeChat Service Account', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/channels/wechat', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'wechat-shop', zhName: '微信小店', enName: 'WeChat Shop', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/wechat-shop', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'wecom', zhName: '企业微信', enName: 'WeCom', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/chatly/group-group-config', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'whatsapp', zhName: 'WhatsApp', enName: 'WhatsApp', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/ycloud', internationalResult: '站内跳转', internationalUrl: '/embedded-app/subapp?url=/butler/ycloud' },
  { id: 'feishu', zhName: '飞书', enName: 'Feishu', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/chatlyz/group-group-config', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'dingtalk', zhName: '钉钉', enName: 'DingTalk', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/chatlyz/group-group-config', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'xiaohongshu', zhName: '小红书', enName: 'Xiaohongshu', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/xhsLogin', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'douyin', zhName: '抖音', enName: 'Douyin', domesticResult: '站内跳转', domesticUrl: '/embedded-app/subapp?url=/butler/chatlyz/group-group-config', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'tiktok', zhName: 'Tiktok', enName: 'Tiktok', domesticResult: '前往国际版', domesticUrl: 'https://app.3chat.ai/chat/login?', internationalResult: '站内跳转', internationalUrl: '/embedded-app/subapp?url=/butler/manyChat' },
  { id: 'facebook', zhName: 'Facebook', enName: 'Facebook', domesticResult: '前往国际版', domesticUrl: 'https://app.3chat.ai/chat/login?', internationalResult: '站内跳转', internationalUrl: '/user-hub/multiview/butlerMeta' },
  { id: 'instagram', zhName: 'Instagram', enName: 'Instagram', domesticResult: '前往国际版', domesticUrl: 'https://app.3chat.ai/chat/login?', internationalResult: '站内跳转', internationalUrl: '/user-hub/multiview/butlerIns' },
  { id: 'telegram', zhName: 'Telegram', enName: 'Telegram', domesticResult: '前往国际版', domesticUrl: 'https://app.3chat.ai/chat/login?', internationalResult: '站内跳转', internationalUrl: '/embedded-app/subapp?url=/butler/manyChat' },
  { id: 'discord', zhName: 'Discord', enName: 'Discord', domesticResult: '前往国际版', domesticUrl: 'https://app.3chat.ai/chat/login?', internationalResult: '站内跳转', internationalUrl: '/user-hub/multiview/butlerDiscord' },
  { id: 'line', zhName: 'Line', enName: 'Line', domesticResult: '前往国际版', domesticUrl: 'https://app.3chat.ai/chat/login?', internationalResult: '站内跳转', internationalUrl: '/user-hub/multiview/butlerLine' },
  { id: 'netease-email', zhName: '网易邮箱', enName: 'Netease Email', domesticResult: '站内跳转', domesticUrl: '/user-hub/multiview/butlerEmail', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'qq-email', zhName: 'QQ邮箱', enName: 'QQ Email', domesticResult: '站内跳转', domesticUrl: '/user-hub/multiview/butlerEmail', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'feishu-email', zhName: '飞书邮箱', enName: 'Feishu Email', domesticResult: '站内跳转', domesticUrl: '/user-hub/multiview/butlerEmail', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'wecom-email', zhName: '企微邮箱', enName: 'WeCom Email', domesticResult: '站内跳转', domesticUrl: '/user-hub/multiview/butlerEmail', internationalResult: '前往国内版', internationalUrl: 'https://app.3chatai.cn/chat/login?' },
  { id: 'amazon-email', zhName: 'Amazon', enName: 'Amazon Email', domesticResult: '站内跳转', domesticUrl: '/user-hub/multiview/butlerEmail', internationalResult: '站内跳转', internationalUrl: '/user-hub/multiview/butlerEmail' },
  { id: 'microsoft-outlook', zhName: 'Microsoft Outlook', enName: 'Microsoft Outlook', domesticResult: '站内跳转', domesticUrl: '/user-hub/multiview/butlerEmail', internationalResult: '站内跳转', internationalUrl: '/user-hub/multiview/butlerEmail' },
  { id: 'gmail', zhName: 'Gmail邮箱', enName: 'Gamil', aliases: ['Gmail', 'Gmail Email', 'Google Mail'], domesticResult: '前往国际版', domesticUrl: 'https://app.3chat.ai/chat/login?', internationalResult: '站内跳转', internationalUrl: '/user-hub/multiview/butlerEmail' },
];

function appOrigin(version: Version): string {
  return version === 'intl' ? 'https://app.3chat.ai' : 'https://app.3chatai.cn';
}

function toExpectedType(result: LegacyExpectedType): ChannelExpectedType {
  if (result.includes('弹窗后')) return 'modal-then-navigation';
  if (result === '站内跳转') return 'internal-navigation';
  return 'external-navigation';
}

function toExpectedBehavior(result: LegacyExpectedType, url: string, version: Version, defaultRiskLevel: RiskLevel): ChannelExpectedBehavior {
  const expectedType = toExpectedType(result);
  const isAbsolute = /^https?:\/\//i.test(url);
  return {
    enabled: true,
    expectedType,
    expectedUrl: url,
    expectedPath: isAbsolute ? undefined : url,
    expectedOrigin: isAbsolute ? new URL(url).origin : appOrigin(version),
    allowExtraQuery: true,
    defaultRiskLevel,
  };
}

export const channelRules: ChannelRule[] = legacyRules.map((rule) => {
  const defaultRiskLevel: RiskLevel = coreChannelIds.has(rule.id) ? 'P1' : 'P2';
  return {
    id: rule.id,
    zhName: rule.zhName,
    enName: rule.enName,
    aliases: rule.aliases,
    category: rule.category || (coreChannelIds.has(rule.id) ? 'core' : 'secondary'),
    versions: {
      cn: toExpectedBehavior(rule.domesticResult, rule.domesticUrl, 'cn', defaultRiskLevel),
      intl: toExpectedBehavior(rule.internationalResult, rule.internationalUrl, 'intl', defaultRiskLevel),
    },
  };
});
