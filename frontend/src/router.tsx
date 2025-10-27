import { NavLink, Outlet, createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import BacktestProPage from './pages/BacktestPro';

function ShellLayout() {
  return (
    <div className="app-shell">
      <nav className="app-shell__nav glow-border">
        <div className="app-shell__brand">XS Miền Bắc Intelligence</div>
        <div className="app-shell__links">
          <NavLink
            to="/"
            end
            className={({ isActive }: { isActive: boolean }) =>
              isActive ? 'nav-link nav-link--active' : 'nav-link'
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/backtest-pro"
            className={({ isActive }: { isActive: boolean }) =>
              isActive ? 'nav-link nav-link--active' : 'nav-link'
            }
          >
            Backtest Pro
          </NavLink>
        </div>
      </nav>
      <div className="app-shell__content">
        <Outlet />
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <ShellLayout />,
    children: [
      {
        index: true,
        element: <App />,
      },
      {
        path: 'backtest-pro',
        element: <BacktestProPage />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
