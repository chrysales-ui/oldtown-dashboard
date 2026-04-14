import Nav from '../components/Nav';

export default function PlaceholderTab({ restaurant, tabName }) {
  return (
    <div style={{ backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      <Nav restaurantName={restaurant.name} />

      <main
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '80px 32px',
          textAlign: 'center',
        }}
      >
        <div
          className="label-caps"
          style={{ color: '#333333', marginBottom: '20px' }}
        >
          {restaurant.name}
        </div>
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: '#222222',
            margin: '0 0 16px',
          }}
        >
          {tabName}
        </h1>
        <p style={{ color: '#333333', fontSize: '0.9rem' }}>
          Coming soon — this section is under construction.
        </p>
      </main>
    </div>
  );
}
