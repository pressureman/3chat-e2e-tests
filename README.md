# 3Chat E2E

本项目是 3Chat 的 Playwright + TypeScript E2E 工程。当前结构以 `tests/profile-run.spec.ts` 作为发布、巡检和综合手动执行的统一入口，通过 `configs/e2e-profiles.ts` 管理运行策略，并继续保留单 Scenario 与 Localization 的调试入口。

核心原则：

- flow 只做 UI 操作。
- scenario 定义业务链路、步骤和检查点。
- e2e-profiles 统一定义发布、daily、manual 的运行范围。
- e2e-launcher 负责按 profile 编排 Scenario、Localization 和通知。
- runner 统一执行 scenario，补充风险结果并触发报告。
- risk-engine 统一计算 `finalRiskLevel / highestRiskLevel / shouldNotify / shouldBlockCI`。
- report-engine 统一按 run 目录输出产物。

## 目录结构

```text
.
├── configs/
│   ├── e2e-profiles.ts
│   ├── env.cn.ts
│   └── env.intl.ts
├── orchestration/
│   └── e2e-launcher.ts
├── notifications/
│   └── feishu.ts
├── flows/
│   ├── login/
│   │   └── password-login.flow.ts
│   ├── register/
│   │   └── email-register.flow.ts
│   └── space/
│       ├── add-space.flow.ts
│       └── space-onboarding.flow.ts
├── scenarios/
│   ├── add-space.scenario.ts
│   ├── login.scenario.ts
│   ├── register.scenario.ts
│   └── types.ts
├── engine/
│   ├── report-engine.ts
│   ├── risk-engine.ts
│   └── runner.ts
├── helpers/
│   ├── aliyun-sms.ts
│   ├── test-email.ts
│   ├── report.ts
│   └── url.ts
├── localization/
│   ├── suite-runner.ts
│   └── ...
├── tests/
│   ├── profile-run.spec.ts
│   ├── scenario.spec.ts
│   └── localization-pages.spec.ts
├── reports/
│   └── scenario/
│       └── {timestamp}_{runMode}_{version}/
├── playwright.config.ts
├── package.json
└── README.md
```

`tests/profile-run.spec.ts` 是 CI / 发布 / Daily / 综合手动的主入口；`tests/scenario.spec.ts` 只用于单 Scenario 调试；`tests/localization-pages.spec.ts` 只用于 Localization 调试。不要删除仍被新结构依赖的 `flows/`、`helpers/`、`configs/`。

## 推荐入口

### Profile Run

发布、Daily 和综合手动都使用同一个入口：

```bash
npm run test:profile
```

通过环境变量选择运行策略和版本：

```bash
E2E_RUN_MODE=release-smoke E2E_VERSION=all npm run test:profile
E2E_RUN_MODE=daily E2E_VERSION=all npm run test:profile
E2E_RUN_MODE=manual E2E_VERSION=intl npm run test:profile
```

可手动覆盖 Scenario 范围：

```bash
E2E_RUN_MODE=manual E2E_VERSION=intl E2E_SCENARIOS=channel,subscription-payment npm run test:profile
E2E_SCENARIOS=all npm run test:profile
E2E_SCENARIOS=none npm run test:profile
```

Localization 可通过 `E2E_LOCALIZATION=true|false` 开关。默认值来自当前 profile。

登录全方式独立合并入口：

```bash
npx playwright test tests/login-methods-suite.spec.ts --project=chromium
```

该入口会在同一个 run 下执行国内版和国际版的 `password`、`phone`、`email` 登录，并写入 `scenarios/login-{version}-{method}/report.md`。

`release-smoke` 默认覆盖：

- 登录：`password`、`phone`、`email`
- 订阅：`subscription-payment`
- 添加空间：`add-space`

当 `E2E_VERSION=all` 时，以上场景会分别在国内版和国际版执行；同一版本下会合并到一个 run 目录，并按 `reportKey` 写入独立 scenario 报告。

CI / 通知规则：

- `release-smoke`：Scenario 的 `P0` 会让 `shouldBlockCI = true`，profile 测试失败。
- `P0/P1` 会让 `shouldNotify = true`。
- `daily` 不阻断 CI，`shouldBlockCI` 始终为 false。
- `P2/P3` 默认只进入报告。
- Scenario 最终失败时按失败 Scenario 发送一条飞书消息。
- Localization 仅在 `issueCount > 0` 时按一次 run 发送一条飞书消息。

## 当前覆盖

当前新结构已具备：

- `login.scenario.ts`：账号密码、手机号、邮箱登录。
- `add-space.scenario.ts`：添加空间完整链路，内部复用已跑通登录和 add-space flow。
- `register.scenario.ts`：邮箱、手机号注册链路，复用从 legacy POC 抽出的注册 flow。
- `channel.scenario.ts`：全渠道卡片跳转检查。
- `subscription-payment.scenario.ts`：订阅支付链路。

当前 suite 状态：

- `profile-run.spec.ts` 通过 `E2E_RUN_MODE` 读取 `configs/e2e-profiles.ts`。
- Profile 入口按环境合并 Functional Scenario 报告；同一环境下的多个 scenario 写入同一个 runDir，每个 scenario 执行时使用独立 browser context/page。
- `scenario.spec.ts` 可通过 `E2E_SCENARIO` 手动运行单个 scenario。
- `localization-pages.spec.ts` 可通过 `E2E_VERSION` 手动运行国际化页面检查。

## 报告产物

每次运行都会生成独立 run 目录：

```text
reports/scenario/{timestamp}_{runMode}_{version}/
```

示例：

```text
reports/scenario/2026-07-03_10-30-12_release-smoke_cn/
reports/scenario/2026-07-03_03-00-00_daily_intl/
```

目录结构：

```text
reports/scenario/{timestamp}_{runMode}_{version}/
├── summary.md
├── summary.json
├── scenarios/
│   └── {scenario}/
│       ├── report.md
│       ├── report.json
│       └── screenshots/
├── traces/
└── artifacts/
```

说明：

- `summary.md/json` 是本次运行总览。
- `scenarios/{scenario}/report.md/json` 是单场景报告。
- `scenarios/{scenario}/screenshots/` 保存该场景截图。
- `traces/`、`artifacts/` 跟随本次 run 归档。
- 不再新增 `reports/md`、`reports/json`、`reports/screenshots` 或 `reports/{scenario}-playwright-report-*` 这种旧平铺目录。

## Localization 页面文案检测

Localization 是独立页面文案检测能力，当前只做指定页面的英文环境中文残留检查。它与 Functional E2E 完全独立，不进入 `ScenarioResult`、`StepResult`、`risk-engine` 或 `shouldBlockCI`，也不会影响现有业务链路结果。

当前支持：

- scan：采集当前视口可见文本。
- hover：显式 hover 指定元素，只检查 hover 后新增文本。
- click：显式点击指定元素，只检查点击后新增文本，可用 `reloadAfter` 恢复页面。
- scroll：滚动到指定比例，只检查滚动后新增文本。

页面配置在 `localization/pages.ts`：

```ts
export const localizationPages = [
  {
    id: 'subscription',
    path: '/subscription',
    checks: [
      { type: 'scan' },
      { type: 'hover', target: '[data-testid="payment-help"]' },
      { type: 'click', target: '[data-testid="change-plan"]', reloadAfter: true },
      { type: 'scroll', positions: [0.5, 1] },
    ],
  },
];
```

检测文本来源包括可见文本节点、`placeholder`、`aria-label` 和 `title`。当前不会采集隐藏 DOM、`data-*`、CSS content、网络响应、JS bundle 或 i18n resource key。

执行命令：

```bash
npm run test:localization:intl
npm run test:localization:intl:headed
npm run test:localization:cn
```

报告输出到：

```text
reports/localization/{runId}/
├── summary.md
├── summary.json
└── screenshots/
```

当前限制：

- 英文环境优先检测 Han、Hiragana、Katakana、Hangul 等非英文残留。
- `zh-CN` 模式只保留基础结构，暂不把英文品牌词或技术词判为错误。
- 不自动点击或 hover 全页面元素，所有交互必须在 `localization/pages.ts` 显式声明。
- 未来如需接入 Scenario，可复用 `text-collector.ts`、`checker.ts` 和 `interactions.ts`，在步骤完成后传入当前 Playwright `Page`，当前阶段不实现 checkpoint。

## 风险规则

风险等级：

- `P0`：核心业务链路不可用，例如登录失败、无法进入系统、无法进入搭建助手。
- `P1`：重要链路异常，影响发布判断或日常巡检通知。
- `P2`：非核心但需要记录的问题，例如可选体验步骤、弹窗文案或次要入口异常。
- `P3`：低风险问题，只进入报告。
- `NONE`：无风险。

Step 类型：

- `action`：UI 操作步骤，用于定位问题。失败通常不直接升级为 P0。
- `checkpoint`：关键业务检查点，用于判断链路是否成功。
- `optional`：可选体验步骤，失败最高不超过 P2。

Run mode：

- `release-smoke`：`P0` 阻断 CI；`P0/P1` 通知。
- `daily`：`P0/P1` 通知；不阻断 CI。
- `manual`：不通知、不阻断，只生成报告。

`Risk Engine` 不定义每个业务步骤的重要性；每个 scenario 的 `stepDefinitions` 提供 `defaultRiskLevel`，risk-engine 只根据上下文计算最终风险。

## 职责边界

### Flow

Flow 只做 UI 操作，例如：

- 打开头像菜单。
- 打开切换空间入口。
- 点击添加空间。
- 输入空间名称并提交。

Flow 不负责：

- 计算 P0/P1/P2。
- 写 report。
- 创建 runDir。
- 决定 `shouldNotify`。
- 决定 `shouldBlockCI`。
- 生成 summary。

### Scenario

Scenario 负责业务链路组合：

- 定义 `stepDefinitions`。
- 调用 flow。
- 将 flow 结果转换为统一 `ScenarioResult`。
- 标记 step 的 `status / message / url / screenshot`。

Scenario 不直接写报告，不决定最终通知和 CI 阻断。

### Runner

Runner 负责统一执行：

- 创建 run 目录。
- 执行 scenario。
- 给 failed step 调用 `evaluateStepRisk`。
- 汇总 scenario/run 风险。
- 调用 report-engine 写报告。

Runner 不写业务逻辑，不操作具体 UI selector，不判断具体页面内容。

### Report Engine

Report Engine 只负责写入产物：

- `summary.md`
- `summary.json`
- `scenarios/{scenario}/report.md`
- `scenarios/{scenario}/report.json`
- `screenshots/`
- `traces/`
- `artifacts/`

Report Engine 不重新计算风险等级，不操作 Playwright 页面。

## 环境变量

Profile 入口：

```env
E2E_RUN_MODE=manual
E2E_VERSION=cn
E2E_SCENARIOS=
E2E_LOCALIZATION=true
E2E_SCENARIO_TIMEOUT_MS=480000
E2E_SCENARIO_RETRIES=1
E2E_REGISTER_PHONE_SMS_COOLDOWN_MS=65000
E2E_TENANT_DISABLE_URL_CN=
E2E_TENANT_DISABLE_URL_INTL=
E2E_TENANT_CLEANUP_FEISHU_NOTIFY=true
E2E_LOCALIZATION_TIMEOUT_MS=900000
FEISHU_WEBHOOK_URL=
E2E_LOCALIZATION_FEISHU_WEBHOOK_URL=
E2E_FEISHU_NOTIFY=failed
```

`E2E_RUN_MODE` 可选值：`release-smoke`、`daily`、`manual`。

`E2E_VERSION` 可选值：`cn`、`intl`、`all`。单 Scenario 和 Localization 调试入口只支持 `cn` 或 `intl`。

`E2E_FEISHU_NOTIFY` 可选值：`always`、`failed`、`off`。默认 `failed`，只在失败时发送飞书通知；未配置对应 webhook 时会跳过通知且不影响测试结果。

`FEISHU_WEBHOOK_URL` 只用于 Scenario / Run 通知；`E2E_LOCALIZATION_FEISHU_WEBHOOK_URL` 只用于 Localization 通知。两类飞书消息分开发送，邮件报告仍在完整 Suite 结束后统一发送一个 zip。

`E2E_REPORT_EMAIL_FAILURE_FEISHU_WEBHOOK_URL` 只用于报告邮件发送失败告警；邮件发送失败不会复用 Scenario 或 Localization webhook。

`E2E_SCENARIO_TIMEOUT_MS` 是所有 Scenario 共用的硬超时，默认 `480000`（8 分钟），对 manual、daily、release-smoke 全部生效。单个 Scenario 超时或异常会生成失败报告并继续执行后续 Scenario。

`E2E_SCENARIO_RETRIES` 是 Scenario 级失败重试次数，默认 `1`。重试只重跑失败的单个 Scenario，不重跑完整 Suite；retry 成功会在报告中标记为 flaky，retry 后仍失败才作为该 Scenario 的最终失败结果进入 summary 和飞书通知。

手机号注册固定按 Scenario attempt 选择号码：国内首次/重试使用 `15000000160` / `15000000161`，国际首次/重试使用 `15000000162` / `15000000163`。手机号注册最多只允许一次 Scenario retry，Flow 内不自行换号。注册结束后会先刷新当前 BrowserContext 的清理凭证；没有完整凭证时，使用同一失败手机号在独立页面执行验证码登录恢复，登录成功或进入 onboarding 后重新捕获凭证并调用当前环境的 tenant disable 接口。只有清理成功或明确确认账号不存在才允许 retry。Scenario 超时不会启动登录恢复：已有完整凭证时只执行 disable，否则标记 `skipped-scenario-timeout` 并禁止 retry。`E2E_TENANT_DISABLE_URL_CN` 和 `E2E_TENANT_DISABLE_URL_INTL` 可覆盖由 `env.appOrigin` 自动派生的接口地址；`E2E_TENANT_CLEANUP_FEISHU_NOTIFY=true` 时，清理失败会使用 `FEISHU_WEBHOOK_URL` 发送不含 Cookie 和完整 Tenant ID 的专用告警。

发送注册短信前会读取 `.data/register-phone-cooldown.json`，按手机号执行 `E2E_REGISTER_PHONE_SMS_COOLDOWN_MS`（默认 65000ms）冷却。该文件仅保存 `phone` 和 `lastSentAt`，只能协调同一工作目录内的进程。

固定注册号码的并发限制：

1. 国内手机号注册不能在多个 CI Job 并发。
2. 国际手机号注册不能在多个 CI Job 并发。
3. `.data` cooldown 只能协调同一工作目录。
4. 跨机器并发需要配置 CI 互斥锁。
5. 国内和国际号码不同，但仍按现有 Suite 顺序执行。

`E2E_LOCALIZATION_TIMEOUT_MS` 是 Localization Suite 级超时，默认 `900000`（15 分钟）。Localization 登录、页面检查或其它前置步骤卡住时，会生成失败的 localization summary 和 `screenshots/error.png`，并继续走现有飞书和邮件逻辑。

Playwright 全局 `retries` 默认为 `0`，避免 `tests/profile-run.spec.ts` 失败后重新执行完整 Suite。完整 Suite 的最终结果由 Scenario Executor 汇总后的结果决定。

当 `FEISHU_WEBHOOK_URL` 或 `E2E_LOCALIZATION_FEISHU_WEBHOOK_URL` 是飞书多维表格自动化 webhook 时，E2E 结果会按字段 JSON 输出。Scenario 和多场景 run 输出 `passedScenariosText`、`failedScenariosText`，字段值为具体场景名或 `reportKey`，多个值用英文逗号分隔；如果没有对应场景则输出 `none`。Scenario 还包含 `method`、`loginMethod`、`registerType`、`reportPath`、`failedSteps` 等；多场景 run 还包含 `summaryPath`、`failedScenarios` 等。Localization 使用独立字段，包含 `runId`、`expectedLocale`、`pages`、`errors`、`issueCount`、`affectedPagesText`、`topIssuesText`、`reportPath` 等。标准飞书群机器人 webhook 则使用结构化 `post` 消息。

报告邮件：

```env
E2E_REPORT_EMAIL_NOTIFY=always
E2E_REPORT_EMAIL_TO=qa@example.com,dev@example.com
E2E_EMAIL_API_URL=https://example.com/api/ai/integration/common/email/send
E2E_REPORT_EMAIL_FAILURE_FEISHU_WEBHOOK_URL=https://open.feishu.cn/...
```

- 只有 `tests/profile-run.spec.ts` 通过 `e2e-launcher` 完整执行 Suite 后才会发送报告邮件；单独运行 scenario、flow 或 Playwright spec 不发送。
- `E2E_REPORT_EMAIL_NOTIFY` 可选值：`always`、`failed`、`off`。默认 `always`，完整 Suite 结束后无论成功失败都会发送；`failed` 表示只在最终结果失败时发送，`off` 表示关闭。
- `E2E_REPORT_EMAIL_TO` 支持多个收件人，使用英文逗号分隔。
- 当前报告邮件固定使用 `https://app.3chatai.cn/api/ai/integration/common/email/send`，发送 `multipart/form-data`，附件字段为 `files`。`E2E_EMAIL_API_URL` 保留为兼容配置，但当前发送逻辑不会读取它。
- `E2E_REPORT_EMAIL_FAILURE_FEISHU_WEBHOOK_URL` 配置报告邮件发送失败时的独立飞书 webhook，不需要 secret。
- 邮件附件是本次执行已生成 report 目录的 zip，包含 `summary.md/json`、所有子场景报告、截图、`traces/`、`artifacts/`，以及本次 localization report（如有）。
- 邮件发送失败会输出 `[report-email]` 错误日志，并尝试发送一条邮件失败飞书告警；报告压缩失败只输出错误日志。两者都不会改变原始 E2E 测试结果或退出码语义。
- 当前邮件接口不支持 CC，因此没有 CC 配置，也不会发送 `cc` 字段。

登录账号：

```env
ADD_SPACE_CN_HOME_URL=https://www.3chatai.cn/
ADD_SPACE_CN_LOGIN_ACCOUNT=your_account@example.com
ADD_SPACE_CN_LOGIN_PASSWORD=your_password

ADD_SPACE_INTL_HOME_URL=https://www.3chat.ai/
ADD_SPACE_INTL_LOGIN_ACCOUNT=
ADD_SPACE_INTL_LOGIN_PASSWORD=
```

账号生效优先级：

```text
cn:
ADD_SPACE_CN_LOGIN_ACCOUNT/PASSWORD
-> CHANNEL_LINK_LOGIN_ACCOUNT/PASSWORD
-> code default

intl:
ADD_SPACE_INTL_LOGIN_ACCOUNT/PASSWORD
-> ADD_SPACE_CN_LOGIN_ACCOUNT/PASSWORD
-> CHANNEL_LINK_LOGIN_ACCOUNT/PASSWORD
-> code default
```

`ADD_SPACE_INTL_LOGIN_ACCOUNT` 和 `ADD_SPACE_INTL_LOGIN_PASSWORD` 是可选项，留空时国际版会复用国内版账号密码。

邮箱验证码登录：

```bash
E2E_LOGIN_METHOD=email npm run test:scenario:login:cn:headed -- --retries=0
E2E_LOGIN_METHOD=email npm run test:scenario:login:intl:headed -- --retries=0
```

邮箱验证码登录使用 `configs/test-accounts.ts` 中配置的固定测试邮箱。验证码通过 `getEmailCode()` 从当前 `E2E_VERSION` 对应的阿里云日志配置查询。

Legacy channel fallback：

```env
CHANNEL_LINK_HOME_URL=
CHANNEL_LINK_LOGIN_ACCOUNT=
CHANNEL_LINK_LOGIN_PASSWORD=
```

`CHANNEL_LINK_*` 是旧 channel 链路配置的兼容 fallback。新配置优先使用 `ADD_SPACE_CN_*` / `ADD_SPACE_INTL_*`，不要再新增依赖 `CHANNEL_LINK_*`。

邮箱注册：

```env
BASE_URL=https://www.3chatai.cn/
ALIYUN_LOG_TOKEN=your_token
ALIYUN_SMS_LOG_PROJECT=xinheyun-prod
ALIYUN_SMS_LOGSTORE=prod
ALIYUN_SMS_LOG_PROJECT_INTL=k8s-log-c02e5f3e3e48a44ff9c7236b696573353
ALIYUN_SMS_LOGSTORE_INTL=prod-sg
E2E_TEST_EMAIL_DOMAIN=e2eTestEmail.com
E2E_TEST_PASSWORD=TestPassword123!
E2E_WORKSPACE_NAME=E2ETest
E2E_CONTACT_PHONE=15000000001
```

邮箱注册不再使用 Mailosaur。测试邮箱按当前本地时间生成，默认格式为 `yymmddhhmmss@e2eTestEmail.com`；不再读取或更新邮箱计数器。验证码按 `E2E_VERSION` 选择 `configs/env.cn.ts` 或 `configs/env.intl.ts` 中的阿里云日志配置查询。

单 Scenario 调试：

```env
E2E_SCENARIO=add-space
E2E_PAYMENT_PATH=monthly-credit-card
```

`E2E_PAYMENT_PATH` 只用于 `subscription-payment` 场景。

## Scenario 命令

手工执行单个业务场景时，推荐使用 `test:scenario:*` 命令：

```bash
npm run test:scenario:login:cn
npm run test:scenario:register:cn
npm run test:scenario:add-space:cn
npm run test:scenario:channel:cn
npm run test:scenario:subscription-payment:cn
```

需要观察浏览器时使用对应的 `:headed` 命令，例如：

```bash
npm run test:scenario:add-space:cn:headed
```

也可以直接传环境变量：

```bash
E2E_VERSION=cn E2E_RUN_MODE=manual E2E_SCENARIO=register npx playwright test tests/scenario.spec.ts --project=chromium
```

## Playwright 报告

查看 Playwright HTML 报告：

```bash
npm run report
```

失败时优先查看：

- `reports/scenario/{runId}/summary.md`
- `reports/scenario/{runId}/scenarios/{scenario}/report.md`
- `test-results/`
- `playwright-report/index.html`

## 新增场景规范

新增场景时：

1. 先把 UI 操作放入 `flows/`。
2. 在 `scenarios/` 中定义 `stepDefinitions` 和 `ScenarioResult` 转换。
3. 通过 `engine/runner.ts` 接入 suite。
4. 由 `engine/risk-engine.ts` 统一补风险。
5. 由 `engine/report-engine.ts` 统一输出 run 目录报告。

选择器优先级建议：

1. `getByTestId`
2. `getByRole`
3. `getByLabel`
4. `getByPlaceholder`
5. `getByText`

尽量避免随机 class、超长 CSS selector 和脆弱 DOM 层级 selector。
