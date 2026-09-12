import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks';

// Tiles are derived entirely from full-context: for each visible module, each
// granted non-READ action becomes a tile, plus a "view" tile for modules that
// grant READ. No module names, action names or labels are hardcoded — labels are
// the API's own display_name.

const HIDDEN_ACTIONS = new Set([]);

function ActionTile({ icon: Icon, iconClass, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col items-center gap-2.5 rounded-2xl border border-[#E8EEF6] bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
      style={{ boxShadow: '0 1px 8px rgba(0,49,88,0.05)' }}
    >
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110 ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="w-full truncate text-center text-xs font-semibold text-text-muted transition-colors group-hover:text-primary">
        {label}
      </span>
      {sub && <span className="w-full truncate text-center text-[10px] text-[#9BB5CB]">{sub}</span>}
    </button>
  );
}

// Rotating tints keep tiles visually distinct; index-based, so a module keeps its
// colour as long as the granted set is stable.
const TINTS = [
  'bg-primary-50 text-primary',
  'bg-accent/10 text-accent',
  'bg-green-50 text-green-600',
  'bg-purple-50 text-purple-500',
];

export default function QuickActions({ className = '' }) {
  const navigate = useNavigate();
  const { navModules } = usePermissions();

  const tiles = navModules.flatMap((m) =>
    m.grantedActions
      .filter((a) => !HIDDEN_ACTIONS.has(a.name))
      .map((a) => ({
        id: `${m.name}:${a.name}`,
        label: a.name === 'READ' ? `View ${m.label}` : a.label,
        sub: a.name === 'READ' ? null : m.label,
        path: m.path,
        icon: m.icon,
      }))
  );

  if (tiles.length === 0) return null;

  return (
    <div className={`panel ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="panel-title">Quick Actions</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.slice(0, 4).map((t, i) => (
          <ActionTile
            key={t.id}
            icon={t.icon}
            iconClass={TINTS[i % TINTS.length]}
            label={t.label}
            sub={t.sub}
            onClick={() => navigate(t.path)}
          />
        ))}
      </div>
    </div>
  );
}
