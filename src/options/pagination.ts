export function getPageCount(itemCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function clampPage(page: number, itemCount: number, pageSize: number): number {
  return Math.min(Math.max(page, 1), getPageCount(itemCount, pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = clampPage(page, items.length, pageSize);
  const startIndex = (safePage - 1) * pageSize;

  return items.slice(startIndex, startIndex + pageSize);
}
