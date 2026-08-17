import type { Locator, Page } from '@playwright/test';
import { firstVisible, typeLikeUser } from '../login/login-common';
import { isBuilderUrl } from '../../helpers/url';

export type SpaceOnboardingResult = {
  enteredOnboarding: boolean;
  filledName: boolean;
  filledPhone: boolean;
  clickedFinish: boolean;
  enteredSystem: boolean;
  requiredFieldChanged: boolean;
  issue: string;
};

async function inputValue(locator: Locator): Promise<string> {
  return locator.inputValue({ timeout: 1_000 }).catch(() => '');
}

async function fillAndKeepValue(
  page: Page,
  locator: Locator,
  value: string,
  label: string,
): Promise<void> {
  let lastValue = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await typeLikeUser(page, locator, value);
    await page.waitForTimeout(attempt === 0 ? 1_000 : 1_500);
    lastValue = await inputValue(locator);
    if (lastValue.trim() === value) {
      return;
    }
  }

  throw new Error(`${label} 输入后未保持，期望=${value}，实际=${lastValue || '<empty>'}`);
}

async function waitForOnboardingFormStable(page: Page): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastSignature = '';
  let stableHits = 0;

  while (Date.now() < deadline) {
    const signature = await page.locator('input, textarea').evaluateAll((elements) => elements
      .map((element) => {
        const input = element as HTMLInputElement | HTMLTextAreaElement;
        return [
          input.placeholder || '',
          input.getAttribute('aria-label') || '',
          input.value || '',
          input.disabled ? 'disabled' : 'enabled',
        ].join(':');
      })
      .join('|')).catch(() => '');

    if (signature && signature === lastSignature) {
      stableHits += 1;
      if (stableHits >= 2) return;
    } else {
      stableHits = 0;
    }

    lastSignature = signature;
    await page.waitForTimeout(500);
  }
}

async function isStillOnOnboarding(page: Page): Promise<boolean> {
  return /\/butler\/on-boarding(?:[/?#]|$)/i.test(page.url());
}

async function waitUntilEnabled(locator: Locator, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const enabled = await locator.isEnabled({ timeout: 1_000 }).catch(() => false);
    const ariaDisabled = await locator.getAttribute('aria-disabled', { timeout: 1_000 }).catch(() => null);
    if (enabled && ariaDisabled !== 'true') return;
    await locator.page().waitForTimeout(500);
  }

  throw new Error('onboarding 完成按钮一直不可用');
}

export async function completeSpaceOnboarding(
  page: Page,
  workspaceName: string,
  contactPhone: string,
): Promise<SpaceOnboardingResult> {
  const result: SpaceOnboardingResult = {
    enteredOnboarding: false,
    filledName: false,
    filledPhone: false,
    clickedFinish: false,
    enteredSystem: false,
    requiredFieldChanged: false,
    issue: '',
  };

  await firstVisible([
    page.getByTestId('onboarding-company-name-input'),
    page.getByTestId('onboarding-workspace-name-input'),
    page.getByRole('textbox', { name: /如何称呼|公司名|名称|Workspace|Name/i }),
    page.getByLabel(/空间名称|工作空间|如何称呼|公司名|名称|Workspace|Name/i),
    page.getByPlaceholder(/空间名称|工作空间|您的名字|公司名|名称|Workspace|Name/i),
    page.getByText(/问卷|onboarding|完善信息|创建成功|欢迎/i),
  ], 45_000);
  result.enteredOnboarding = true;
  await waitForOnboardingFormStable(page);

  const nameInput = await firstVisible([
    page.getByTestId('onboarding-company-name-input'),
    page.getByRole('textbox', { name: /如何称呼|公司名|公司名称|Your company name|Your name|Company name/i }),
    page.getByLabel(/如何称呼|公司名|公司名称|Your company name|Your name|Company name/i),
    page.getByPlaceholder(/您的名字|公司名|公司名称|Your company name|Your name|Company name/i),
  ], 15_000);
  await fillAndKeepValue(page, nameInput, workspaceName, 'onboarding 名称');
  result.filledName = true;

  const workspaceInput = await firstVisible([
    page.getByTestId('onboarding-workspace-name-input'),
    page.getByRole('textbox', { name: /空间名称|工作空间|Name your new workspace|Workspace name|Space name/i }),
    page.getByLabel(/空间名称|工作空间|Name your new workspace|Workspace name|Space name/i),
    page.getByPlaceholder(/空间名称|工作空间|Name your new workspace|Workspace name|Space name/i),
  ], 5_000).catch(() => null);
  if (workspaceInput) {
    await fillAndKeepValue(page, workspaceInput, workspaceName, 'onboarding 空间名称');
  }

  const phoneInput = await firstVisible([
    page.getByTestId('onboarding-contact-phone-input'),
    page.getByLabel(/手机号|联系电话|电话|Phone|phone number/i),
    page.getByPlaceholder(/手机号|联系电话|电话|Phone|phone number/i),
  ], 10_000).catch(() => null);
  if (phoneInput) {
    await fillAndKeepValue(page, phoneInput, contactPhone, 'onboarding 手机号');
    result.filledPhone = true;
  }

  const finalNameValue = await inputValue(nameInput);
  if (finalNameValue.trim() !== workspaceName) {
    result.requiredFieldChanged = true;
    result.issue = `点击完成前名称字段值异常，期望=${workspaceName}，实际=${finalNameValue || '<empty>'}`;
    return result;
  }

  if (workspaceInput) {
    const finalWorkspaceValue = await inputValue(workspaceInput);
    if (finalWorkspaceValue.trim() !== workspaceName) {
      result.requiredFieldChanged = true;
      result.issue = `点击完成前空间名称字段值异常，期望=${workspaceName}，实际=${finalWorkspaceValue || '<empty>'}`;
      return result;
    }
  }

  const finishButton = await firstVisible([
    page.getByTestId('onboarding-finish-button'),
    page.getByRole('button', { name: /完成|开始使用|进入系统|确认|继续|Finish|Done/i }),
    page.getByText(/完成|开始使用|进入系统|确认|继续|Finish|Done/i),
  ], 15_000);
  await waitUntilEnabled(finishButton, 20_000);
  await finishButton.click({ force: true });
  result.clickedFinish = true;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (isBuilderUrl(url)) {
      result.enteredSystem = true;
      return result;
    }
    if (!await isStillOnOnboarding(page)) {
      result.enteredSystem = true;
      return result;
    }
    await page.waitForTimeout(750);
  }

  result.requiredFieldChanged = true;
  result.issue = '点击完成后仍停留在 onboarding，可能表单值被清空、必填字段未通过校验、账单下发未完成或完成按钮无响应。';
  return result;
}
