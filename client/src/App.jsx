import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Login from "@/pages/Login";
import ClientProfile from "@/pages/ClientProfile";
import AdviserCompliance from "@/pages/AdviserCompliance";

// Minimal routing shell. Dashboard/Tasks pages are still empty placeholders
// owned by other slices, so this only wires up the routes the Documents &
// Compliance feature needs, plus enough auth to get a real session for
// testing (full navigation/app shell still to come).
function Home() {
  const { user, signOut } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl">Royal Square Financial</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button size="sm" variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Temporary entry point. Replace once full navigation is wired up.
      </p>
      <div className="flex flex-col gap-1 text-sm">
        <Link className="text-primary underline underline-offset-4" to="/clients/demo">
          View a client's documents
        </Link>
        <Link
          className="text-primary underline underline-offset-4"
          to="/advisers/demo/compliance"
        >
          View adviser compliance
        </Link>
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="/clients/:clientId"
        element={
          <RequireAuth>
            <ClientProfile />
          </RequireAuth>
        }
      />
      <Route
        path="/advisers/:adviserId/compliance"
        element={
          <RequireAuth>
            <AdviserCompliance />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
