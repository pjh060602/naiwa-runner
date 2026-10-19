export function mustGet(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少 DOM 节点 #${id}`);
  return element;
}
