import type { Page } from '@playwright/test';
import type { BillingContentContext } from './subscription.flow';

export type VTableCellAddress = { col: number; row: number };

export type VTablePendingScanResult = {
  hostDetected: boolean;
  instanceFound: boolean;
  moreActionCells: VTableCellAddress[];
  pendingRowCount: number;
  message?: string;
};

const moreActionPattern = /更多|More/i;
// Live bill list status cell shows enum PENDING_PAID (not localized 待支付 / Pending Payment).
const pendingPaymentStatusPattern = /待支付|Pending\s*Payment|PENDING_PAID/i;

function rowTextIndicatesPendingPayment(rowText: string): boolean {
  const normalized = rowText.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (/^(?:状态|Status|操作|Actions?|Action|Payment\s*Status)$/i.test(normalized)) return false;
  return pendingPaymentStatusPattern.test(normalized);
}

export function vtableActionCellIsMore(actionText: string): boolean {
  const normalized = actionText.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return moreActionPattern.test(normalized);
}

export function vtableRowLooksPending(
  rowText: string,
  statusText: string,
  actionText: string,
): boolean {
  if (vtableActionCellIsMore(actionText)) return true;
  if (rowTextIndicatesPendingPayment(statusText)) return true;
  return rowTextIndicatesPendingPayment(rowText);
}

export async function billListHostIsVTable(context: BillingContentContext): Promise<boolean> {
  return await context.locator('.vtable canvas:visible').first().isVisible({ timeout: 500 }).catch(() => false);
}

/**
 * Resolve VisActor ListTable instance.
 * PR path: host.__vtable__
 * Live CN/intl (2026-10): __vtable__ is NOT on DOM — instance lives on a React ref hook.
 */
const resolveVTableSource = `(() => {
  function looksLikeTable(value) {
    if (!value || typeof value !== 'object') return false;
    try {
      return typeof value.getCellValue === 'function'
        && typeof value.rowCount === 'number'
        && typeof value.colCount === 'number'
        && value.rowCount > 0
        && value.colCount > 0;
    } catch {
      return false;
    }
  }

  function resolveFromDomProperty() {
    const roots = Array.from(document.querySelectorAll('.vtable'));
    for (const host of roots) {
      if (host.__vtable__ && looksLikeTable(host.__vtable__)) return host.__vtable__;
      const canvas = host.querySelector('canvas');
      if (!canvas) continue;
      let node = canvas;
      while (node) {
        if (node.__vtable__ && looksLikeTable(node.__vtable__)) return node.__vtable__;
        node = node.parentElement;
      }
    }
    return null;
  }

  function resolveFromReactFiber() {
    const seen = new WeakSet();
    const queue = [];
    const canvas = document.querySelector('.vtable canvas, canvas');
    let start = canvas;
    for (let i = 0; i < 12 && start; i += 1) {
      const fiberKey = Object.keys(start).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (fiberKey) queue.push(start[fiberKey]);
      start = start.parentElement;
    }

    let steps = 0;
    while (queue.length && steps < 8000) {
      const value = queue.shift();
      steps += 1;
      if (value == null || (typeof value !== 'object' && typeof value !== 'function')) continue;
      if (seen.has(value)) continue;
      try { seen.add(value); } catch { continue; }

      if (looksLikeTable(value)) return value;

      for (const key of ['memoizedState', 'memoizedProps', 'pendingProps', 'stateNode', 'return', 'child', 'sibling', 'alternate', 'ref', 'current', 'next', 'queue']) {
        if (value[key]) queue.push(value[key]);
      }

      if (value.memoizedState && typeof value.memoizedState === 'object') {
        let hook = value.memoizedState;
        for (let h = 0; h < 50 && hook; h += 1) {
          if (hook.memoizedState) queue.push(hook.memoizedState);
          if (hook.queue) queue.push(hook.queue);
          hook = hook.next;
        }
      }

      try {
        for (const key of Object.keys(value).slice(0, 40)) queue.push(value[key]);
      } catch {}
    }
    return null;
  }

  return resolveFromDomProperty() || resolveFromReactFiber();
})()`;

export async function scanVTablePendingCells(context: BillingContentContext): Promise<VTablePendingScanResult> {
  const hostDetected = await billListHostIsVTable(context);
  if (!hostDetected) {
    return {
      hostDetected: false,
      instanceFound: false,
      moreActionCells: [],
      pendingRowCount: 0,
    };
  }

  const result = await context.evaluate((resolveSource) => {
    function cellDisplayValue(value: unknown): string {
      if (value == null) return '';
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      }
      return String(value);
    }

    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    const table = new Function(`return (${resolveSource})`)() as {
      colCount: number;
      rowCount: number;
      columnHeaderLevelCount?: number;
      getCellValue: (col: number, row: number) => unknown;
      records?: Array<Record<string, unknown>>;
      options?: { records?: Array<Record<string, unknown>> };
    } | null;

    if (!table) {
      return {
        instanceFound: false,
        moreActionCells: [] as { col: number; row: number }[],
        pendingRowCount: 0,
        message: '未在页面中找到可访问的 VTable 实例（__vtable__ 或 React ref）。',
      };
    }

    const headerRows = table.columnHeaderLevelCount ?? 1;
    let actionsCol = -1;
    let statusCol = -1;

    for (let col = 0; col < table.colCount; col += 1) {
      let headerText = '';
      for (let row = 0; row < headerRows; row += 1) {
        headerText += ` ${cellDisplayValue(table.getCellValue(col, row))}`;
      }
      const normalized = headerText.replace(/\s+/g, ' ').trim();
      if (actionsCol < 0 && /^(?:操作|Actions?|Action)$/i.test(normalized)) actionsCol = col;
      if (statusCol < 0 && /(?:账单状态|Bill\s*Status|Payment\s*Status|支付状态|状态|Status)/i.test(normalized)) {
        statusCol = col;
      }
    }

    if (actionsCol < 0 && table.colCount > 0) actionsCol = table.colCount - 1;

    const moreActionCells: { col: number; row: number }[] = [];
    let pendingRowCount = 0;

    const records = table.records || table.options?.records;

    for (let row = headerRows; row < table.rowCount; row += 1) {
      let rowText = '';
      for (let col = 0; col < table.colCount; col += 1) {
        rowText += ` ${cellDisplayValue(table.getCellValue(col, row))}`;
      }
      const actionText = actionsCol >= 0 ? cellDisplayValue(table.getCellValue(actionsCol, row)) : '';
      const statusText = statusCol >= 0 ? cellDisplayValue(table.getCellValue(statusCol, row)) : '';

      // records[] is 0-indexed data rows (no header)
      const recordIndex = row - headerRows;
      const recordStatus = records && records[recordIndex]
        ? String(records[recordIndex].status ?? records[recordIndex].paymentStatus ?? '')
        : '';

      const looksPending = /更多|More/i.test(actionText)
        || /待支付|Pending\s*Payment|PENDING_PAID/i.test(statusText)
        || /待支付|Pending\s*Payment|PENDING_PAID/i.test(rowText)
        || /PENDING_PAID/i.test(recordStatus);

      if (!looksPending) continue;
      pendingRowCount += 1;

      // Actions column is often a custom renderer (getCellValue → null) but still clickable as More for pending rows.
      if (actionsCol >= 0 && (/更多|More/i.test(actionText) || !actionText.trim() || /Detail|详情/i.test(actionText) === false)) {
        // Only queue More-click for pending rows whose action is not Detail-only.
        // When action text empty + PENDING_PAID → treat as More.
        if (/Detail|详情/i.test(actionText) && !/更多|More/i.test(actionText)) {
          // Detail-only (already paid/closed) — should not happen for looksPending, skip click target
        } else {
          moreActionCells.push({ col: actionsCol, row });
        }
      }
    }

    return {
      instanceFound: true,
      moreActionCells,
      pendingRowCount,
    };
  }, resolveVTableSource);

  return {
    hostDetected: true,
    ...result,
  };
}

export async function clickVTableCell(
  page: Page,
  context: BillingContentContext,
  address: VTableCellAddress,
): Promise<boolean> {
  const point = await context.evaluate(({ col, row, resolveSource }) => {
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    const table = new Function(`return (${resolveSource})`)() as {
      canvas?: HTMLCanvasElement;
      getCellRelativeRect: (col: number, row: number) => any;
      _makeVisibleCell?: (col: number, row: number) => void;
      makeVisibleCell?: (col: number, row: number) => void;
    } | null;
    if (!table) return null;

    const makeVisible = table.makeVisibleCell || table._makeVisibleCell;
    makeVisible?.call(table, col, row);

    const rectRaw = table.getCellRelativeRect(col, row);
    let left = 0;
    let top = 0;
    let width = 0;
    let height = 0;
    if (rectRaw && typeof rectRaw.left === 'number') {
      left = rectRaw.left;
      top = rectRaw.top;
      width = rectRaw.width || 0;
      height = rectRaw.height || 0;
    } else if (rectRaw?.bounds) {
      left = rectRaw.bounds.x1;
      top = rectRaw.bounds.y1;
      width = rectRaw.bounds.x2 - rectRaw.bounds.x1;
      height = rectRaw.bounds.y2 - rectRaw.bounds.y1;
    } else if (rectRaw && typeof rectRaw.x1 === 'number') {
      left = rectRaw.x1;
      top = rectRaw.y1;
      width = rectRaw.x2 - rectRaw.x1;
      height = rectRaw.y2 - rectRaw.y1;
    } else {
      return null;
    }

    const canvas = table.canvas || document.querySelector('.vtable canvas, canvas');
    if (!canvas) return null;
    const canvasRect = canvas.getBoundingClientRect();
    // Action cells are wide; "More" text sits left of geometric center.
    // Prior void-verify known-good: canvas.right - 72 ≈ left + ~0.4*width.
    const xOffset = Math.max(24, Math.min(width * 0.4, width - 24));
    const yOffset = height / 2;
    return {
      x: canvasRect.left + left + xOffset,
      y: canvasRect.top + top + yOffset,
    };
  }, { ...address, resolveSource: resolveVTableSource }).catch(() => null);

  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  await page.mouse.click(point.x, point.y);
  return true;
}
