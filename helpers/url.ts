export type ProductVersion = '国内版' | '国际版' | '未确认';

export function appOriginForVersion(version: ProductVersion): string {
  if (version === '国际版') return 'https://app.3chat.ai';
  return 'https://app.3chatai.cn';
}

export function detectVersionFromUrl(url: string, bodyText = ''): ProductVersion {
  if (/app\.3chatai\.cn|3chatai\.cn/.test(url) || /国内版/.test(bodyText)) return '国内版';
  if (/app\.3chat\.ai|3chat\.ai/.test(url) || /国际版/.test(bodyText)) return '国际版';
  return '未确认';
}

export function currentDomain(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '未确认';
  }
}

export function isBuilderUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const embeddedPath = parsedUrl.searchParams.get('url') || '';
    return /\/butler\/agent\/builder(?:[/?#]|$)/i.test(parsedUrl.pathname)
      || /\/butler\/agent\/builder(?:[/?#]|$)/i.test(embeddedPath);
  } catch {
    return /\/butler\/agent\/builder(?:[/?#]|$)/i.test(url);
  }
}
