export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const without = items.filter((_, i) => i !== from);
  return [...without.slice(0, to), items[from], ...without.slice(to)];
}
