import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './shared/LanguageContext';
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
import MessagingPage from './pages/MessagingPage';
import ActivatePage from './pages/ActivatePage';
import ProfileSetupPage from './pages/ProfileSetupPage';
import GitHubReviewPage from './pages/GitHubReviewPage';
import SettingsPage from './pages/SettingsPage';
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import PricingPage from "./pages/PricingPage";
import PaymentPage from "./pages/PaymentPage";
import { ProposalsPage }       from "./pages/ProposalsPage";
import { ClientProposalsPage } from "./pages/ClientProposalsPage";
import { ContractPage }        from "./pages/ContractPage";
import { ContractsListPage }   from "./pages/ContractsListPage";
import { FreelancerProfilePage } from "./pages/FreelancerProfilePage";
import LaunchpadPage from "./pages/LaunchpadPage";
import SkillGrowthPage from "./pages/SkillGrowthPage";
import ClientSettingsPage from "./pages/ClientSettingsPage";

const App = () => {
  return (
    <LanguageProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/activate" element={<ActivatePage />} />

        {/* ── Pricing & Payment (public) ── */}
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/payment" element={<PaymentPage />} />

        {/* ── Forgot / Reset Password ── */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password"  element={<ForgotPasswordPage />} />

        {/* ── Freelancer Public Profile ── */}
        <Route path="/freelancer/:userId" element={<FreelancerProfilePage />} />

        {/* ── Proposals ── */}
        <Route
          path="/proposals"
          element={
            <RequireRole role="freelancer">
              <ProposalsPage />
            </RequireRole>
          }
        />
        <Route
          path="/client/proposals"
          element={
            <RequireRole role="client">
              <ClientProposalsPage />
            </RequireRole>
          }
        />

        {/* ── Contracts ── */}
        <Route
          path="/contracts"
          element={
            <RequireRole role={["freelancer", "client"]}>
              <ContractsListPage />
            </RequireRole>
          }
        />
        <Route
          path="/contract/:contractId"
          element={
            <RequireRole role={["freelancer", "client"]}>
              <ContractPage />
            </RequireRole>
          }
        />

        {/* ── Dashboard routes ── */}
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
        <Route
          path="/profile-setup"
          element={
            <RequireRole role="freelancer">
              <ProfileSetupPage />
            </RequireRole>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireRole role={["freelancer", "client", "admin"]}>
              <MessagingPage />
            </RequireRole>
          }
        />
        <Route
          path="/settings/client"
          element={
            <RequireRole role="client">
              <ClientSettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireRole role="freelancer">
              <SettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/github/review"
          element={
            <RequireRole role="freelancer">
              <GitHubReviewPage />
            </RequireRole>
          }
        />
        <Route
          path="/launchpad"
          element={
            <RequireRole role="freelancer">
              <LaunchpadPage />
            </RequireRole>
          }
        />
        <Route
          path="/skill-growth"
          element={
            <RequireRole role="freelancer">
              <SkillGrowthPage />
            </RequireRole>
          }
        />
      </Routes>
    </BrowserRouter>
    </LanguageProvider>
  );
};

export default App;