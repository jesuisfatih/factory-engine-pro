import { useWorkspaceBrand, workspaceBadge, workspaceName } from '../lib/workspace-brand';

interface Props {
  className?: string;
  badgeSize?: number;
  badgeFontSize?: number;
  subtitle?: string;
}

export function WorkspaceBrand({
  className = 'auth-brand',
  badgeSize = 40,
  badgeFontSize = 14,
  subtitle = 'Customer service workspace',
}: Props) {
  const brandQuery = useWorkspaceBrand();
  const name = workspaceName(brandQuery.data?.workspaceName);
  const badge = workspaceBadge(brandQuery.data?.brandBadge, name);
  const isSidebarBrand = className.split(/\s+/).includes('workspace');

  return (
    <div className={className}>
      {brandQuery.data?.brandLogo
        ? <img className="ws-logo" src={brandQuery.data.brandLogo} alt="" style={{ width: badgeSize, height: badgeSize }} />
        : <div className="ws-badge" style={{ width: badgeSize, height: badgeSize, fontSize: badgeFontSize }}>{badge}</div>}
      <div className={isSidebarBrand ? 'ws-meta' : undefined}>
        <div className="name">{name}</div>
        <div className={isSidebarBrand ? 'role' : 'muted'}>{subtitle}</div>
      </div>
    </div>
  );
}
