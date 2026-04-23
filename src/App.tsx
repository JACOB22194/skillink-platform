import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FreelancerDashboard from './pages/FreelancerDashboard';
import ClientDashboard from './pages/ClientDashboard';
import AdminDashboard from './pages/AdminDashboard';
import RequireRole from './shared/RequireRole';
import MFASetupPage from './pages/MFASetupPage';
import PostProjectPage from './pages/PostProjectPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* The main URL "/" will show the Landing Page */}
        <Route path="/" element={<LandingPage />} />
        
        {/* The "/login" URL will show your dark-mode Login screen */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Dashboard routes */}
        <Route
          path="/dashboard/freelancer"
          element={
            <RequireRole role="freelancer">
              <FreelancerDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/client"
          element={
            <RequireRole role="client">
              <ClientDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/admin"
          element={
            <RequireRole role="admin">
              <AdminDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/post-project"
          element={
            <RequireRole role="client">
              <PostProjectPage />
            </RequireRole>
          }
        />
  <Route
    path="/settings/mfa"
    element={
      <RequireRole role={["freelancer", "client", "admin"]}>
        <MFASetupPage />
      </RequireRole>
    }
  />
  <Route
    path="/settings/profile"
    element={
      <RequireRole role="freelancer">
        <ProfileSettingsPage />
      </RequireRole>
    }
  />
      </Routes>
    </BrowserRouter>
  );
};

export default App;