const E2E_TEST_EMAIL_DOMAIN = process.env.E2E_TEST_EMAIL_DOMAIN || 'e2eTestEmail.com';

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function createTestEmail(now = new Date()): string {
  const timestamp = [
    twoDigits(now.getFullYear() % 100),
    twoDigits(now.getMonth() + 1),
    twoDigits(now.getDate()),
    twoDigits(now.getHours()),
    twoDigits(now.getMinutes()),
    twoDigits(now.getSeconds()),
  ].join('');

  return `${timestamp}@${E2E_TEST_EMAIL_DOMAIN}`;
}
