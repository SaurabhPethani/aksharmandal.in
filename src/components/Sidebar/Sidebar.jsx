import { ChevronRight, LogOut } from 'lucide-react';
import logoSquare from '../../assets/logo-square.png';
import { SidebarGroup } from './SidebarGroup';
import { useNavigation } from '../../hooks/useNavigation';

/**
 * A GRADIENT AGAIN, BUT A QUIET ONE — and the reason is the edge it has to hold.
 *
 * The panel was flat `#003158`, the same navy as the header and the footer, so
 * that the three frame surfaces read as one colour. They read as one SURFACE
 * instead: the header runs right up against the panel, and with both painted the
 * identical value there was nothing along that seam to say where the navigation
 * stopped and the page began.
 *
 * So brand navy stays the panel's colour — it is the value in the middle of the
 * ramp, and most of the panel's height sits near it — while the top lifts a
 * little and the foot drops. That is enough to separate it at every point along
 * the header's edge without the panel reading as a different colour from the
 * frame it belongs to.
 *
 * NOT what was here before, which was a five-stop ramp (#004a80 → #003158 →
 * #002548 → #003668 → #001f40) that lightened again two thirds of the way down —
 * a band, not a shade — under an orange radial glow that put a warm cast on the
 * top of the menu belonging to no other surface in the app. Three stops, one
 * direction, no glow.
 *
 * `PANEL_EDGE` is the second half of the same job: a hairline of white at 8% down
 * the panel's right side. The gradient separates the two surfaces by tone; the
 * hairline draws the actual boundary, which is what the eye follows when the
 * page behind it scrolls.
 *
 * Applied as an inline `background`, so keeping the name means the panel's ground
 * has one definition to change.
 */
export const PANEL_BG = 'linear-gradient(180deg, #00436F 0%, #003158 45%, #002340 100%)';
export const PANEL_EDGE = 'inset -1px 0 0 rgba(255,255,255,0.08)';

export function ExpandedPanel({ roleName, onCollapse, onNavigate, onSignOut }) {
  const { navigationTree } = useNavigation();

  return (
    <div
      className="scrollbar-none relative flex h-full flex-col overflow-y-auto"
      style={{ background: PANEL_BG, boxShadow: PANEL_EDGE }}
    >

      <div className="relative flex items-start justify-between px-5 pb-5 pt-10">
        <img
          src={logoSquare}
          alt="Akshar Connect"
          className="h-24 w-24 rounded-2xl object-cover"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}
        />
        <button
          onClick={onCollapse}
          aria-label="Collapse navigation"
          className="mt-1 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.65)',
          }}
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
      </div>

      {/* The role, without the name above it. The name is already on the header
          chip and in the dashboard greeting; printing it a third time, at the
          largest size on screen, made the panel about who you are rather than
          about where you can go. The role stays — it is the one thing here that
          explains why this menu has the entries it has. */}
      <div className="relative px-5 pb-7">
        <span
          className="inline-block rounded-full px-3.5 py-1 text-xs font-semibold"
          style={{
            color: 'rgba(255,255,255,0.80)',
            border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(255,255,255,0.12)',
          }}
        >
          {roleName}
        </span>
      </div>

      <nav className="relative flex-1 space-y-2.5 px-4 pb-6">
        <SidebarGroup items={navigationTree} onNavigate={onNavigate} isRail={false} />

        <button
          onClick={onSignOut}
          className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 opacity-90 transition-all duration-150 hover:opacity-100 mt-4"
          style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: 'rgba(255,255,255,0.72)' }}><LogOut className="h-5 w-5" /></span>
            {/* Steps up with the nav labels above it — Logout is the last row of
                the same list and should not read a size smaller than the rest. */}
            <span className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.80)' }}>Logout</span>
          </div>
          <ChevronRight className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.38)' }} />
        </button>
      </nav>
    </div>
  );
}

export function CollapsedRail({ onSignOut }) {
  const { navigationTree } = useNavigation();

  return (
    <div
      className="scrollbar-none flex h-full flex-col overflow-y-auto border-r border-[#E8EEF6] bg-white"
      style={{ boxShadow: '4px 0 24px rgba(28,58,92,0.07)' }}
    >
      <div className="flex min-h-[68px] items-center justify-center border-b border-[#E8EEF6] py-4">
        <img
          src={logoSquare}
          alt="Akshar Connect"
          className="h-9 w-9 rounded-xl object-cover"
          style={{ boxShadow: '0 3px 10px rgba(28,58,92,0.20)' }}
        />
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        <SidebarGroup items={navigationTree} isRail={true} />
      </nav>

      <div className="border-t border-[#E8EEF6] px-2 pb-4 pt-3">
        <button
          onClick={onSignOut}
          title="Logout"
          className="flex w-full items-center justify-center rounded-xl p-3 text-red-400 transition-all duration-150 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar(props) {
  return props.isOpen ? <ExpandedPanel {...props} /> : <CollapsedRail {...props} />;
}

export default Sidebar;
