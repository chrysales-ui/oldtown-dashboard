import { Routes, Route, useParams, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Ads from './pages/Ads';
import Analytics from './pages/Analytics';
import Scorecard from './pages/Scorecard';
import ClientReport from './pages/ClientReport';
import PlaceholderTab from './pages/PlaceholderTab';
import { restaurants } from './data/restaurants';

function RestaurantRoutes() {
  const { slug } = useParams();
  const restaurant = restaurants[slug];

  if (!restaurant) {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route index element={<Dashboard restaurant={restaurant} />} />
      <Route path="ads" element={<Ads restaurant={restaurant} />} />
      <Route path="analytics" element={<Analytics restaurant={restaurant} />} />
      <Route path="scorecard" element={<Scorecard restaurant={restaurant} />} />
      <Route path="client-report" element={<ClientReport restaurant={restaurant} />} />
      <Route path="social" element={<PlaceholderTab restaurant={restaurant} tabName="Social Media" />} />
      <Route path="influencer" element={<PlaceholderTab restaurant={restaurant} tabName="Influencer Partnerships" />} />
      <Route path="blog" element={<PlaceholderTab restaurant={restaurant} tabName="Blog" />} />
      <Route path="emails" element={<PlaceholderTab restaurant={restaurant} tabName="Emails" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:slug/*" element={<RestaurantRoutes />} />
    </Routes>
  );
}
