import type { LocalizationPageDefinition } from './types';

type DiscoveredLocalizationPage = LocalizationPageDefinition & {
  name: string;
  sourceMenu: string;
  tags: string[];
};

export const localizationPages = [

  {
    id: "butler-agent-builder",
    name: "Agent Builder",
    path: "/embedded-app/subapp?url=/butler/agent/builder",
    sourceMenu: "Agent Builder",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-agent-config",
    name: "General setting",
    path: "/embedded-app/subapp?url=/butler/agent/config",
    sourceMenu: "General setting",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-batchtest",
    name: "Batch test",
    path: "/embedded-app/subapp?url=/butler/batchTest",
    sourceMenu: "Batch test",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-channels-livechat-apperance",
    name: "Appearance",
    path: "/embedded-app/subapp?url=/butler/channels/livechat/apperance",
    sourceMenu: "Appearance",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-channels-livechat-installation-qywechat",
    name: "WeChat Customer Service",
    path: "/embedded-app/subapp?url=/butler/channels/livechat/installation/qywechat",
    sourceMenu: "WeChat Customer Service",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-channels-livechat-installation-website",
    name: "Website installation",
    path: "/embedded-app/subapp?url=/butler/channels/livechat/installation/website",
    sourceMenu: "Website installation",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-channels-overview",
    name: "Channel Overview",
    path: "/embedded-app/subapp?url=/butler/channels/overview",
    sourceMenu: "Channel Overview",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-channels-wechat",
    name: "WeChat Service Account",
    path: "/embedded-app/subapp?url=/butler/channels/wechat",
    sourceMenu: "WeChat Service Account",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-chat",
    name: "Customer reception workbench",
    path: "/embedded-app/subapp?url=/butler/chatly/chat",
    sourceMenu: "Customer reception workbench",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-api",
    name: "API Authorization",
    path: "/embedded-app/subapp?url=/butler/chatly/group-api",
    sourceMenu: "API Authorization",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-api-add-friend",
    name: "Add friends via API",
    path: "/embedded-app/subapp?url=/butler/chatly/group-api-add-friend",
    sourceMenu: "Add friends via API",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-auto-friend",
    name: "New Contact Greeting",
    path: "/embedded-app/subapp?url=/butler/chatly/group-auto-friend",
    sourceMenu: "New Contact Greeting",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-calendar",
    name: "Marketing Calendar",
    path: "/embedded-app/subapp?url=/butler/chatly/group-calendar",
    sourceMenu: "Marketing Calendar",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-card-add-friend",
    name: "Add friends via business cards",
    path: "/embedded-app/subapp?url=/butler/chatly/group-card-add-friend",
    sourceMenu: "Add friends via business cards",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-contact-list",
    name: "Customer list",
    path: "/embedded-app/subapp?url=/butler/chatly/group-contact-list",
    sourceMenu: "Customer list",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-contact-task-list",
    name: "Private chat mass messaging (Advanced)",
    path: "/embedded-app/subapp?url=/butler/chatly/group-contact-task-list",
    sourceMenu: "Private chat mass messaging (Advanced)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-excel-add-friend",
    name: "Add friends on Excel",
    path: "/embedded-app/subapp?url=/butler/chatly/group-excel-add-friend",
    sourceMenu: "Add friends on Excel",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-express-contact-task-list",
    name: "Private chat mass messaging (Ultra-fast)",
    path: "/embedded-app/subapp?url=/butler/chatly/group-express-contact-task-list",
    sourceMenu: "Private chat mass messaging (Ultra-fast)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-express-room-task-list",
    name: "Group chat mass messaging (Ultra-fast)",
    path: "/embedded-app/subapp?url=/butler/chatly/group-express-room-task-list",
    sourceMenu: "Group chat mass messaging (Ultra-fast)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-friend",
    name: "Moments",
    path: "/embedded-app/subapp?url=/butler/chatly/group-friend",
    sourceMenu: "Moments",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-group-config",
    name: "Connect to WeCom",
    path: "/embedded-app/subapp?url=/butler/chatly/group-group-config",
    sourceMenu: "Connect to WeCom",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-miao-hui-tag",
    name: "Custom tag",
    path: "/embedded-app/subapp?url=/butler/chatly/group-miao-hui-tag",
    sourceMenu: "Custom tag",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-room-add-friend",
    name: "Add friends in group chats",
    path: "/embedded-app/subapp?url=/butler/chatly/group-room-add-friend",
    sourceMenu: "Add friends in group chats",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-room-list",
    name: "Group chat list",
    path: "/embedded-app/subapp?url=/butler/chatly/group-room-list",
    sourceMenu: "Group chat list",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-room-task-list",
    name: "Group chat mass messaging (Advanced)",
    path: "/embedded-app/subapp?url=/butler/chatly/group-room-task-list",
    sourceMenu: "Group chat mass messaging (Advanced)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-setting",
    name: "Add friend settings",
    path: "/embedded-app/subapp?url=/butler/chatly/group-setting",
    sourceMenu: "Add friend settings",
    tags: ["critical","release"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-sop-contact",
    name: "Private chat SOP",
    path: "/embedded-app/subapp?url=/butler/chatly/group-sop-contact",
    sourceMenu: "Private chat SOP",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-sop-friend",
    name: "SOP of Moments",
    path: "/embedded-app/subapp?url=/butler/chatly/group-sop-friend",
    sourceMenu: "SOP of Moments",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-sop-room",
    name: "Group chat SOP",
    path: "/embedded-app/subapp?url=/butler/chatly/group-sop-room",
    sourceMenu: "Group chat SOP",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-sop-template",
    name: "SOP template",
    path: "/embedded-app/subapp?url=/butler/chatly/group-sop-template",
    sourceMenu: "SOP template",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-tag-sop",
    name: "SOP of tag",
    path: "/embedded-app/subapp?url=/butler/chatly/group-tag-sop",
    sourceMenu: "SOP of tag",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-task-list",
    name: "Enterprise task",
    path: "/embedded-app/subapp?url=/butler/chatly/group-task-list",
    sourceMenu: "Enterprise task",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-group-wecom-tag",
    name: "WeCom tag",
    path: "/embedded-app/subapp?url=/butler/chatly/group-wecom-tag",
    sourceMenu: "WeCom tag",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-keyword-replay",
    name: "Keyword Replies",
    path: "/embedded-app/subapp?url=/butler/chatly/keyword-replay",
    sourceMenu: "Keyword Replies",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-msg-history",
    name: "Chat history",
    path: "/embedded-app/subapp?url=/butler/chatly/msg-history",
    sourceMenu: "Chat history",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatly-org-api",
    name: "Callback event configuration",
    path: "/embedded-app/subapp?url=/butler/chatly/org-api",
    sourceMenu: "Callback event configuration",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-chat",
    name: "Customer reception workbench",
    path: "/embedded-app/subapp?url=/butler/chatlyz/chat",
    sourceMenu: "Customer reception workbench",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-api",
    name: "API Authorization",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-api",
    sourceMenu: "API Authorization",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-api-add-friend",
    name: "Add friends via API",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-api-add-friend",
    sourceMenu: "Add friends via API",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-auto-friend",
    name: "New Contact Greeting",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-auto-friend",
    sourceMenu: "New Contact Greeting",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-calendar",
    name: "Marketing Calendar",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-calendar",
    sourceMenu: "Marketing Calendar",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-card-add-friend",
    name: "Add friends via business cards",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-card-add-friend",
    sourceMenu: "Add friends via business cards",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-contact-list",
    name: "Customer list",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-contact-list",
    sourceMenu: "Customer list",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-contact-task-list",
    name: "Private chat mass messaging (Advanced)",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-contact-task-list",
    sourceMenu: "Private chat mass messaging (Advanced)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-excel-add-friend",
    name: "Add friends on Excel",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-excel-add-friend",
    sourceMenu: "Add friends on Excel",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-express-contact-task-list",
    name: "Private chat mass messaging (Ultra-fast)",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-express-contact-task-list",
    sourceMenu: "Private chat mass messaging (Ultra-fast)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-express-room-task-list",
    name: "Group chat mass messaging (Ultra-fast)",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-express-room-task-list",
    sourceMenu: "Group chat mass messaging (Ultra-fast)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-friend",
    name: "Moments",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-friend",
    sourceMenu: "Moments",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-group-config",
    name: "Connect to social platform",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-group-config",
    sourceMenu: "Connect to social platform",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-im-materials",
    name: "Social asset",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-im-materials",
    sourceMenu: "Social asset",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-miao-hui-tag",
    name: "Custom tag",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-miao-hui-tag",
    sourceMenu: "Custom tag",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-room-add-friend",
    name: "Add friends in group chats",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-room-add-friend",
    sourceMenu: "Add friends in group chats",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-room-list",
    name: "Group chat list",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-room-list",
    sourceMenu: "Group chat list",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-room-task-list",
    name: "Group chat mass messaging (Advanced)",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-room-task-list",
    sourceMenu: "Group chat mass messaging (Advanced)",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-setting",
    name: "Add friend settings",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-setting",
    sourceMenu: "Add friend settings",
    tags: ["critical","release"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-sop-contact",
    name: "Private chat SOP",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-sop-contact",
    sourceMenu: "Private chat SOP",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-sop-friend",
    name: "SOP of Moments",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-sop-friend",
    sourceMenu: "SOP of Moments",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-sop-room",
    name: "Group chat SOP",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-sop-room",
    sourceMenu: "Group chat SOP",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-sop-template",
    name: "SOP template",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-sop-template",
    sourceMenu: "SOP template",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-tag-sop",
    name: "SOP of tag",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-tag-sop",
    sourceMenu: "SOP of tag",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-task-list",
    name: "Enterprise task",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-task-list",
    sourceMenu: "Enterprise task",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-group-wecom-tag",
    name: "Enterprise tag",
    path: "/embedded-app/subapp?url=/butler/chatlyz/group-wecom-tag",
    sourceMenu: "Enterprise tag",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-im-materials",
    name: "Asset library",
    path: "/embedded-app/subapp?url=/butler/chatlyz/im-materials",
    sourceMenu: "Asset library",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-keyword-replay",
    name: "Keyword Replies",
    path: "/embedded-app/subapp?url=/butler/chatlyz/keyword-replay",
    sourceMenu: "Keyword Replies",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-msg-history",
    name: "Chat history",
    path: "/embedded-app/subapp?url=/butler/chatlyz/msg-history",
    sourceMenu: "Chat history",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatlyz-org-api",
    name: "Callback event configuration",
    path: "/embedded-app/subapp?url=/butler/chatlyz/org-api",
    sourceMenu: "Callback event configuration",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-chatperson",
    name: "WeChat",
    path: "/embedded-app/subapp?url=/butler/chatperson",
    sourceMenu: "WeChat",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-dashboard",
    name: "Message Report",
    path: "/embedded-app/subapp?url=/butler/dashboard",
    sourceMenu: "Message Report",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-data-insights",
    name: "Customer Insight",
    path: "/embedded-app/subapp?url=/butler/data-insights",
    sourceMenu: "Customer Insight",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-inbox",
    name: "Inbox",
    path: "/embedded-app/subapp?url=/butler/inbox",
    sourceMenu: "Inbox",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-manychat",
    name: "Manychat",
    path: "/embedded-app/subapp?url=/butler/manyChat",
    sourceMenu: "Manychat",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-newcore-workspace-info",
    name: "Workspace",
    path: "/embedded-app/subapp?url=/butler/newcore/workspace-info",
    sourceMenu: "Workspace",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-prompt",
    name: "Guidance",
    path: "/embedded-app/subapp?url=/butler/prompt",
    sourceMenu: "Guidance",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-sandbox",
    name: "Sandbox",
    path: "/embedded-app/subapp?url=/butler/sandbox",
    sourceMenu: "Sandbox",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-shoplineinstall",
    name: "SHOPLINE",
    path: "/embedded-app/subapp?url=/butler/shoplineInstall",
    sourceMenu: "SHOPLINE",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-wechat-shop",
    name: "WeChat Store",
    path: "/embedded-app/subapp?url=/butler/wechat-shop",
    sourceMenu: "WeChat Store",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "butler-xhslogin",
    name: "Rednote",
    path: "/embedded-app/subapp?url=/butler/xhsLogin",
    sourceMenu: "Rednote",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "standard-app-table-core-openapi-apilog",
    name: "API Call Log",
    path: "/standard-app/table/core_openapi_apiLog",
    sourceMenu: "API Call Log",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "standard-app-table-core-openapi-app",
    name: "OAuth Client",
    path: "/standard-app/table/core_openapi_app",
    sourceMenu: "OAuth Client",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "standard-app-table-core-openapi-eventlog",
    name: "Event Subscription Log",
    path: "/standard-app/table/core_openapi_eventLog",
    sourceMenu: "Event Subscription Log",
    tags: ["critical","release"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "standard-app-table-core-openapi-webhook",
    name: "Webhook",
    path: "/standard-app/table/core_openapi_webhook",
    sourceMenu: "Webhook",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "standard-app-table-core-openapi-webwidget",
    name: "App",
    path: "/standard-app/table/core_openapi_webWidget",
    sourceMenu: "App",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "universal-app-data-platform",
    name: "3Chat Config",
    path: "/universal-app/data-platform",
    sourceMenu: "3Chat Config",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-bill-list",
    name: "Bill",
    path: "/user-hub/bill/list",
    sourceMenu: "Bill",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-login-log",
    name: "Login Logs",
    path: "/user-hub/login/log",
    sourceMenu: "Login Logs",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butleragenttask",
    name: "AI Skill",
    path: "/user-hub/multiview/butlerAgentTask",
    sourceMenu: "AI Skill",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlerapitoken",
    name: "Authentication",
    path: "/user-hub/multiview/butlerApiToken",
    sourceMenu: "Authentication",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlerchatly",
    name: "IM Reply Category",
    path: "/user-hub/multiview/butlerChatly",
    sourceMenu: "IM Reply Category",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butleremail",
    name: "Mailbox",
    path: "/user-hub/multiview/butlerEmail",
    sourceMenu: "Mailbox",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butleremailignored",
    name: "Ignored email addresses",
    path: "/user-hub/multiview/butlerEmailIgnored",
    sourceMenu: "Ignored email addresses",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlergroup",
    name: "Group",
    path: "/user-hub/multiview/butlerGroup",
    sourceMenu: "Group",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlerknowledge",
    name: "Knowledge content",
    path: "/user-hub/multiview/butlerKnowledge",
    sourceMenu: "Knowledge content",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlermcptool",
    name: "Tool use",
    path: "/user-hub/multiview/butlerMCPTool",
    sourceMenu: "Tool use",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlermessage",
    name: "Message history",
    path: "/user-hub/multiview/butlerMessage",
    sourceMenu: "Message history",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlerstandardanswer",
    name: "Standard answer",
    path: "/user-hub/multiview/butlerStandardAnswer",
    sourceMenu: "Standard answer",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlervisitor",
    name: "Contacts",
    path: "/user-hub/multiview/butlerVisitor",
    sourceMenu: "Contacts",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-butlervisitorgroup",
    name: "Contact group",
    path: "/user-hub/multiview/butlerVisitorGroup",
    sourceMenu: "Contact group",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-multiview-mcptoolcalllog",
    name: "Tool invocation log",
    path: "/user-hub/multiview/mcpToolCallLog",
    sourceMenu: "Tool invocation log",
    tags: ["critical"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-package-detail",
    name: "My Subscription(Beta)",
    path: "/user-hub/package/detail",
    sourceMenu: "My Subscription(Beta)",
    tags: ["critical","release"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-package-list",
    name: "My Subscription",
    path: "/user-hub/package/list",
    sourceMenu: "My Subscription",
    tags: ["critical","release"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  },


  {
    id: "user-hub-staff-list",
    name: "Member",
    path: "/user-hub/staff/list",
    sourceMenu: "Member",
    tags: ["critical","release"],
    checks: [
      {
        type: "scan",
      },
      {
        type: "scroll",
        positions: [0.25, 0.5, 0.75, 1],
      },
    ],
  }
] satisfies DiscoveredLocalizationPage[];
