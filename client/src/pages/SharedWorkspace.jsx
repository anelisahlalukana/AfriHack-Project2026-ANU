import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { createRemindersApi } from "../api/reminders";
import RemindersWorkspace from "./RemindersWorkspace";

export default function SharedWorkspace() {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const api = createRemindersApi();
    Promise.all([api("/me"), api("/config")]).then(([identity, config]) => {
      if (config.demo) throw new Error("The backend is in demo mode. Restart it with npm run dev to use the shared database.");
      if (active) setState({ identity, config });
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [user.id]);
  if (error) return <main className="account-page"><section className="card"><h1>Workspace unavailable</h1><p className="error" role="alert">{error}</p><Link to="/account">Back to your account</Link></section></main>;
  if (!state) return <p className="loading" role="status">Opening your shared workspace…</p>;
  return <RemindersWorkspace key={user.id} user={state.identity} pushConfig={state.config.push} />;
}
