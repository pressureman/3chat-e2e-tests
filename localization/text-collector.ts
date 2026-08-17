import type { Page } from '@playwright/test';

export interface TextCandidate {
  text: string;
  selector?: string;
  tagName?: string;
  role?: string;
  source: 'text' | 'placeholder' | 'aria-label' | 'title';
}

export function candidateKey(candidate: TextCandidate): string {
  return [
    candidate.source,
    candidate.selector || '',
    normalizeCandidateText(candidate.text),
  ].join(':');
}

export function diffCandidates(after: TextCandidate[], before: TextCandidate[]): TextCandidate[] {
  const beforeKeys = new Set(before.map(candidateKey));
  return dedupeCandidates(after.filter((candidate) => !beforeKeys.has(candidateKey(candidate))));
}

export function dedupeCandidates(candidates: TextCandidate[]): TextCandidate[] {
  const seen = new Set<string>();
  const deduped: TextCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function normalizeCandidateText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function collectVisibleText(page: Page): Promise<TextCandidate[]> {
  const candidates = await page.evaluate(() => {
    type BrowserTextCandidate = {
      text: string;
      selector?: string;
      tagName?: string;
      role?: string;
      source: 'text' | 'placeholder' | 'aria-label' | 'title';
    };

    const normalize = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();

    const isVisible = (element: Element): boolean => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }

      const rect = htmlElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom < 0 || rect.right < 0) return false;
      if (rect.top > window.innerHeight || rect.left > window.innerWidth) return false;

      return true;
    };

    const selectorFor = (element: Element): string => {
      const testId = element.getAttribute('data-testid');
      if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

      const id = element.getAttribute('id');
      if (id) return `#${CSS.escape(id)}`;

      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        const tag = current.tagName.toLowerCase();
        const parent: Element | null = current.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }

        const siblings = Array.from(parent.children as HTMLCollectionOf<Element>)
          .filter((child: Element) => child.tagName === current?.tagName);
        const index = siblings.indexOf(current) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        current = parent;
      }

      return parts.join(' > ');
    };

    const ignoredTextContainers = new Set(['script', 'style', 'noscript', 'template']);

    const hasIgnoredAncestor = (element: Element): boolean => {
      let current: Element | null = element;
      while (current) {
        const tagName = current.tagName.toLowerCase();
        if (ignoredTextContainers.has(tagName)) return true;
        if (current.getAttribute('aria-hidden') === 'true') return true;
        current = current.parentElement;
      }
      return false;
    };

    const visibleTextElement = (node: Node): Element | null => {
      const element = node.parentElement;
      if (!element || hasIgnoredAncestor(element) || !isVisible(element)) return null;
      return element;
    };

    const output: BrowserTextCandidate[] = [];
    const pushCandidate = (
      element: Element,
      text: string | null | undefined,
      source: BrowserTextCandidate['source'],
    ) => {
      const normalized = normalize(text);
      if (!normalized || !isVisible(element)) return;

      output.push({
        text: normalized,
        selector: selectorFor(element),
        tagName: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || undefined,
        source,
      });
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = normalize(node.textContent);
        if (!text) return NodeFilter.FILTER_REJECT;
        const element = visibleTextElement(node);
        if (!element) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = walker.nextNode();
    while (node) {
      const element = visibleTextElement(node);
      if (element) pushCandidate(element, node.textContent, 'text');
      node = walker.nextNode();
    }

    for (const element of Array.from(document.querySelectorAll('[placeholder], [aria-label], [title]'))) {
      pushCandidate(element, element.getAttribute('placeholder'), 'placeholder');
      pushCandidate(element, element.getAttribute('aria-label'), 'aria-label');
      pushCandidate(element, element.getAttribute('title'), 'title');
    }

    return output;
  });

  return dedupeCandidates(candidates);
}
