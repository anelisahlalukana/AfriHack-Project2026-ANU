import { useEffect, useState } from "react";
import Dev4Workspace from "./Dev4Workspace";
import { createDev4Api } from "../api/dev4";

export default function Dev4Demo() {
  const [config, setConfig] = useState(null);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    createDev4Api()("/config")
      .then((result) => {
        if (active) {
          setConfig(result);
          setUserId(result.users[0]?.id || "");
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <div className="rs-start">
        <h1>Royal Square</h1>
        <p role="alert">{error}</p>
        <p>
          Start the backend and frontend together with{" "}
          <code>npm run dev:demo</code>.
        </p>
        <button onClick={() => location.reload()}>Retry connection</button>
      </div>
    );
  if (!config)
    return (
      <div className="rs-start" role="status">
        Opening Royal Square…
      </div>
    );
  if (!config.demo)
    return (
      <div className="rs-start">
        <h1>Royal Square</h1>
        <p>Dev 4 is ready for the team's authentication integration.</p>
        <p>
          For the local demo, run <code>npm run dev:demo</code>. See{" "}
          <code>docs/dev4.md</code> for the verified-user integration contract.
        </p>
      </div>
    );
  const user = config.users.find((item) => item.id === userId);
  return (
    <Dev4Workspace
      key={userId}
      user={user}
      demo
      users={config.users}
      onSwitchUser={setUserId}
      pushConfig={config.push}
    />
  );
}
