import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "./components/layout/DashboardLayout";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route path="wallet" element={<div style={{ padding: '20px', color: 'white', backgroundColor: '#333' }}>Wallet Page</div>} />
          <Route path="profile" element={<div style={{ padding: '20px', color: 'white', backgroundColor: '#333' }}>Profile Page</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
