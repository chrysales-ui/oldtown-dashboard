import { Link, useParams, useLocation } from 'react-router-dom';

const tabs = [
  { label: 'Dashboard', path: '' },
  { label: 'Ads', path: '/ads' },
  { label: 'Analytics', path: '/analytics' },
  { label: 'Scorecard', path: '/scorecard' },
  { label: 'Client Report', path: '/client-report' },
  { label: 'Social Media', path: '/social' },
  { label: 'Influencer Partnerships', path: '/influencer' },
  { label: 'Blog', path: '/blog' },
  { label: 'Emails', path: '/emails' },
];

export default function Nav({ restaurantName }) {
  const { slug } = useParams();
  const location = useLocation();

  const getTabPath = (tabPath) => `/${slug}${tabPath}`;

  const isActive = (tabPath) => {
    const full = getTabPath(tabPath);
    if (tabPath === '') {
      return location.pathname === `/${slug}` || location.pathname === `/${slug}/`;
    }
    return location.pathname.startsWith(full);
  };

  return (
    <nav
      style={{
        backgroundColor: '#0a0a0a',
        borderBottom: '1px solid #1e1e1e',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'stretch',
          gap: '32px',
          height: '52px',
        }}
      >
        {/* Back to home */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: '#444', fontSize: '0.82rem', gap: 6, whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          All Restaurants
        </Link>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Tabs hidden */}
      </div>
    </nav>
  );
}
