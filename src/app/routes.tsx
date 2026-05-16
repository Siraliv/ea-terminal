import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { ProtectedRoute } from '@/app/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { UploadPage } from '@/features/upload/UploadPage';
import { TestsLibraryPage } from '@/features/tests/TestsLibraryPage';
import { TestDetailPage } from '@/features/tests/TestDetailPage';
import { ComparePage } from '@/features/compare/ComparePage';
import { EAsPage } from '@/features/eas/EAsPage';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { SystemPage } from '@/features/system/SystemPage';

/**
 * EA Terminal router.
 *
 * Public:
 * - `/login`              → email/password sign-in
 *
 * Auth'd (wrapped in ProtectedRoute → AppShell):
 * - `/`                   → /dashboard
 * - `/dashboard`          → KPIs + recent uploads + top performers
 * - `/upload`             → drag-and-drop MT5 reports
 * - `/tests`              → filterable, sortable library
 * - `/tests/:id`          → single test detail
 * - `/compare`            → overlay equity curves of multiple tests
 * - `/eas`                → per-EA roll-up
 * - `*`                   → /dashboard
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'upload', element: <UploadPage /> },
      { path: 'tests', element: <TestsLibraryPage /> },
      { path: 'tests/:id', element: <TestDetailPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'eas', element: <EAsPage /> },
      { path: 'portfolio', element: <PortfolioPage /> },
      { path: 'system', element: <SystemPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
