import { useWorkspaceBrand, workspaceBadge, workspaceName } from '../lib/workspace-brand';
import { resolveBrandLogoUrl } from '@factory-engine-pro/contracts';

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
  const logo = resolveBrandLogoUrl(brandQuery.data?.brandAssets, brandQuery.data?.brandLogo, isSidebarBrand ? 'dark' : 'light');

  return (
    <div className={className}>
      {logo
        ? <img className="ws-logo" src={logo} alt="" style={{ width: badgeSize, height: badgeSize }} />
        : <div className="ws-badge" style={{ width: badgeSize, height: badgeSize, fontSize: badgeFontSize }}>{badge}</div>}
      <div className={isSidebarBrand ? 'ws-meta' : undefined}>
        <div className="name">{name}</div>
        <div className={isSidebarBrand ? 'role' : 'muted'}>{subtitle}</div>
      </div>
    </div>
  );
}
