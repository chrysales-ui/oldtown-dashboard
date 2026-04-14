import { Link } from 'react-router-dom';
import { restaurants } from '../data/restaurants';

function RestaurantCard({ restaurant }) {
  const isLive = restaurant.status === 'live';
  const isComingSoon = restaurant.status === 'coming-soon';

  return (
    <Link to={`/${restaurant.slug}/scorecard`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          backgroundColor: isComingSoon ? '#0d0d0d' : '#111111',
          border: '1px solid #1e1e1e',
          borderRadius: '20px',
          padding: '32px',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background-color 0.2s',
          opacity: isComingSoon ? 0.7 : 1,
          position: 'relative',
          minHeight: '180px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
        onMouseEnter={(e) => {
          if (!isComingSoon) {
            e.currentTarget.style.borderColor = '#333333';
            e.currentTarget.style.backgroundColor = '#161616';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#1e1e1e';
          e.currentTarget.style.backgroundColor = isComingSoon ? '#0d0d0d' : '#111111';
        }}
      >
        {/* Top row: badge + arrow */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          {isLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              backgroundColor: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: '999px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
              Live
            </span>
          )}
          {isComingSoon && (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#666',
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: '999px',
            }}>
              Coming Soon
            </span>
          )}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isComingSoon ? '#333' : '#555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </div>

        {/* Name + address */}
        <div>
          <h2 style={{
            fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em',
            color: isComingSoon ? '#555' : '#ffffff', margin: '0 0 8px',
          }}>
            {restaurant.name}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#444444', margin: 0 }}>
            {restaurant.address}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div style={{ backgroundColor: '#000000', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 32px' }}>

        {/* Hero — centered */}
        <div style={{ textAlign: 'center', padding: '96px 0 72px' }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: '#22c55e', marginBottom: '24px',
          }}>
            Hospitality Group
          </div>
          <h1 style={{
            fontSize: 'clamp(4rem, 12vw, 8rem)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#ffffff',
            margin: '0 0 24px',
          }}>
            GuestGetter
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#555555', margin: 0, letterSpacing: '0.01em' }}>
            Performance · Analytics · Growth
          </p>
        </div>

        {/* Restaurant cards — 3-col grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          paddingBottom: '80px',
        }}>
          {Object.values(restaurants).filter(r => !r.hidden).map((r) => (
            <RestaurantCard key={r.slug} restaurant={r} />
          ))}
        </div>

      </main>
    </div>
  );
}
