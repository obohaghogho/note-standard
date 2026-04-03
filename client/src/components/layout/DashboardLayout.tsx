import { Outlet, useLocation } from "react-router-dom";

export const DashboardLayout = () => {
  const location = useLocation();

  return (
    <div style={{ padding: '20px', color: 'white', backgroundColor: '#111', minHeight: '100vh' }}>
      <h1>Dashboard Layout Temp Test</h1>
      <Outlet key={location.pathname} />
    </div>
  );
};
