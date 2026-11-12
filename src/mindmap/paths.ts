/** Mindmaps routes: `/mindmaps/:mapKey?node=N-n&direction=D-n` (the task panel and the directions tab link here). */
export const mapPath = (mapKey?: string, sel: { node?: string; direction?: string } = {}): string => {
  const q = new URLSearchParams();
  if (sel.node) q.set('node', sel.node);
  if (sel.direction) q.set('direction', sel.direction);
  const s = q.toString();
  return `/mindmaps${mapKey ? `/${encodeURIComponent(mapKey)}` : ''}${s ? `?${s}` : ''}`;
};
