import { SidebarItem } from './SidebarItem';

export function SidebarGroup({ items = [], depth = 0, onNavigate, isRail = false }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <SidebarItem
          key={item.id}
          item={item}
          depth={depth}
          onNavigate={onNavigate}
          isRail={isRail}
        />
      ))}
    </div>
  );
}
