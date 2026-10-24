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
const pendingPaymentStatusPattern = /待支付|Pending\s*Payment/i;

function rowTextIndicatesPendingPayment(rowText: string): boolean {
  const normalized = rowText.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (/^(?:状态|Status|操作|Actions?|Action)$/i.test(normalized)) return false;
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

  const result = await context.evaluate(() => {
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

    type VTableInstance = {
      colCount: number;
      rowCount: number;
      columnHeaderLevelCount?: number;
      canvas?: HTMLCanvasElement;
      getCellValue: (col: number, row: number) => unknown;
    };

    function resolveVTableFromDocument(): VTableInstance | null {
      const roots = Array.from(document.querySelectorAll('.vtable'));
      for (const host of roots) {
        const hostWithVTable = host as HTMLElement & { __vtable__?: VTableInstance };
        if (hostWithVTable.__vtable__) return hostWithVTable.__vtable__;
        const canvas = host.querySelector('canvas');
        if (!canvas) continue;
        let node: HTMLElement | null = canvas;
        while (node) {
          const withVTable = node as HTMLElement & { __vtable__?: VTableInstance };
          if (withVTable.__vtable__) return withVTable.__vtable__;
          node = node.parentElement;
        }
      }
      return null;
    }

    function findColumnIndexes(table: VTableInstance): { actionsCol: number; statusCol: number; headerRows: number } {
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
        if (statusCol < 0 && /(?:账单状态|Bill\s*Status|状态|Status)/i.test(normalized)) statusCol = col;
      }

      if (actionsCol < 0) {
        for (let col = table.colCount - 1; col >= 0; col -= 1) {
          let headerText = '';
          for (let row = 0; row < headerRows; row += 1) {
            headerText += ` ${cellDisplayValue(table.getCellValue(col, row))}`;
          }
          if (/操作|Actions?/i.test(headerText)) {
            actionsCol = col;
            break;
          }
        }
      }

      if (actionsCol < 0 && table.colCount > 0) actionsCol = table.colCount - 1;

      return { actionsCol, statusCol, headerRows };
    }

    function vtableActionCellIsMore(actionText: string): boolean {
      const normalized = actionText.replace(/\s+/g, ' ').trim();
      if (!normalized) return false;
      return /更多|More/i.test(normalized);
    }

    function rowTextIndicatesPendingPayment(rowText: string): boolean {
      const normalized = rowText.replace(/\s+/g, ' ').trim();
      if (!normalized) return false;
      if (/^(?:状态|Status|操作|Actions?|Action)$/i.test(normalized)) return false;
      return /待支付|Pending\s*Payment/i.test(normalized);
    }

    function vtableRowLooksPending(rowText: string, statusText: string, actionText: string): boolean {
      if (vtableActionCellIsMore(actionText)) return true;
      if (rowTextIndicatesPendingPayment(statusText)) return true;
      return rowTextIndicatesPendingPayment(rowText);
    }

    const table = resolveVTableFromDocument();
    if (!table) {
      return {
        instanceFound: false,
        moreActionCells: [] as { col: number; row: number }[],
        pendingRowCount: 0,
        message: '未在页面中找到可访问的 VTable 实例（__vtable__）。',
      };
    }

    const { actionsCol, statusCol, headerRows } = findColumnIndexes(table);
    const moreActionCells: { col: number; row: number }[] = [];
    let pendingRowCount = 0;

    for (let row = headerRows; row < table.rowCount; row += 1) {
      let rowText = '';
      for (let col = 0; col < table.colCount; col += 1) {
        rowText += ` ${cellDisplayValue(table.getCellValue(col, row))}`;
      }
      const actionText = actionsCol >= 0 ? cellDisplayValue(table.getCellValue(actionsCol, row)) : '';
      const statusText = statusCol >= 0 ? cellDisplayValue(table.getCellValue(statusCol, row)) : '';

      if (!vtableRowLooksPending(rowText, statusText, actionText)) continue;
      pendingRowCount += 1;

      if (vtableActionCellIsMore(actionText) && actionsCol >= 0) {
        moreActionCells.push({ col: actionsCol, row });
      }
    }

    return {
      instanceFound: true,
      moreActionCells,
      pendingRowCount,
    };
  });

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
  const point = await context.evaluate(({ col, row }) => {
    type VTableInstance = {
      canvas?: HTMLCanvasElement;
      getCellRelativeRect: (col: number, row: number) => { left: number; top: number; width: number; height: number };
      _makeVisibleCell?: (col: number, row: number) => void;
      makeVisibleCell?: (col: number, row: number) => void;
    };

    function resolveVTableFromDocument(): { table: VTableInstance; canvas: HTMLCanvasElement } | null {
      const roots = Array.from(document.querySelectorAll('.vtable'));
      for (const host of roots) {
        const hostWithVTable = host as HTMLElement & { __vtable__?: VTableInstance };
        if (hostWithVTable.__vtable__) {
          const table = hostWithVTable.__vtable__;
          const canvas = table.canvas || host.querySelector('canvas');
          if (canvas) return { table, canvas };
        }
        const canvas = host.querySelector('canvas');
        if (canvas) {
          let node: HTMLElement | null = canvas;
          while (node) {
            const withVTable = node as HTMLElement & { __vtable__?: VTableInstance };
            if (withVTable.__vtable__) {
              const table = withVTable.__vtable__;
              return { table, canvas: table.canvas || canvas };
            }
            node = node.parentElement;
          }
        }
      }
      return null;
    }

    const resolved = resolveVTableFromDocument();
    if (!resolved) return null;

    const { table, canvas } = resolved;
    const makeVisible = table.makeVisibleCell || table._makeVisibleCell;
    makeVisible?.call(table, col, row);

    const rect = table.getCellRelativeRect(col, row);
    const canvasRect = canvas.getBoundingClientRect();
    return {
      x: canvasRect.left + rect.left + rect.width / 2,
      y: canvasRect.top + rect.top + rect.height / 2,
    };
  }, address).catch(() => null);

  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  return true;
}
