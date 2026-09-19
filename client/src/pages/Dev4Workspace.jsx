import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Link2,
  MessageSquare,
  Plus,
  Settings2,
} from "lucide-react";
import { createDev4Api, disablePush, enablePush } from "../api/dev4";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import "./Dev4Workspace.css";

const dateLabel = (value) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const recurrence = (value) =>
  value ? `Every ${value} month${value === 1 ? "" : "s"}` : "One time";
const tabs = [
  ["reminders", "Reminders", CalendarDays],
  ["notifications", "Notifications", Bell],
  ["messages", "Messages", MessageSquare],
  ["connections", "Financial connection", Link2],
];

function ClientSelect({ clients, value, onChange, disabled = false }) {
  return (
    <label>
      Client
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        {!clients.length && <option value="">No clients available</option>}
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// Dev 1 can render this with a verified user and their current Supabase access token.
export default function Dev4Workspace({
  user,
  accessToken,
  demo = false,
  users = [],
  onSwitchUser,
  pushConfig,
}) {
  const api = useMemo(
    () =>
      createDev4Api({ demoUserId: demo ? user.id : undefined, accessToken }),
    [demo, user.id, accessToken],
  );
  const [tab, setTab] = useState(
    location.hash === "#notifications" ? "notifications" : "reminders",
  );
  const [data, setData] = useState({
    clients: [],
    reminders: [],
    rules: [],
    notifications: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [sound, setSound] = useState(false);
  const [pushState, setPushState] = useState("");
  const audio = useRef(null);
  const knownNotifications = useRef(null);
  const adviser = user.role === "adviser";
  const unread = data.notifications.filter((n) => !n.readAt).length;
  const refresh = useCallback(async () => {
    const [clients, reminders, rules, notifications] = await Promise.all(
      ["/clients", "/reminders", "/rules", "/notifications"].map((path) =>
        api(path),
      ),
    );
    setData({ clients, reminders, rules, notifications });
    setLoading(false);
  }, [api]);
  useEffect(() => {
    let active = true;
    let fetching = false;
    async function load() {
      if (fetching || !active) return;
      fetching = true;
      try {
        await refresh();
      } catch (err) {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      } finally {
        fetching = false;
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refresh]);
  useEffect(() => {
    const next = new Set(data.notifications.map((n) => n.id));
    if (
      sound &&
      knownNotifications.current &&
      data.notifications.some(
        (n) => !knownNotifications.current.has(n.id) && !n.readAt,
      ) &&
      audio.current?.state === "running"
    ) {
      const oscillator = audio.current.createOscillator();
      const gain = audio.current.createGain();
      oscillator.connect(gain);
      gain.connect(audio.current.destination);
      oscillator.frequency.setValueAtTime(660, audio.current.currentTime);
      oscillator.frequency.setValueAtTime(
        880,
        audio.current.currentTime + 0.13,
      );
      gain.gain.setValueAtTime(0.08, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.35,
      );
      oscillator.start();
      oscillator.stop(audio.current.currentTime + 0.35);
    }
    knownNotifications.current = next;
  }, [data.notifications, sound]);
  useEffect(
    () => () => {
      audio.current?.close();
    },
    [],
  );
  async function act(action, success) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      try {
        await refresh();
      } catch {
        setError(
          "Your change was saved, but the workspace could not refresh. It will retry automatically.",
        );
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const clientName = (id) => data.clients.find((c) => c.id === id)?.name || id;
  const activeReminders = data.reminders.filter(
    (r) => r.status !== "completed",
  );
  const visibleReminders = data.reminders.filter(
    (r) =>
      filter === "all" ||
      (filter === "completed"
        ? r.status === "completed"
        : r.status !== "completed"),
  );
  const navigation = adviser
    ? [...tabs, ["rules", "Reminder rules", Settings2]]
    : tabs;
  return (
    <div className="rs-workspace">
      <aside className="rs-sidebar">
        <Brand />
        {!demo && <Link to="/account">Back to your account</Link>}
        <nav aria-label="Workspace navigation">
          {navigation.map(([id, title, Icon]) => (
            <button
              type="button"
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setError("");
                setNotice("");
              }}
            >
              <Icon size={16} />
              {title}
              {id === "notifications" && unread > 0 && (
                <b className="rs-count">{unread}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="rs-user">
          <div className="rs-avatar">
            {user.name
              .split(" ")
              .filter((word) => /^[A-Za-z]/.test(word))
              .slice(0, 2)
              .map((word) => word[0])
              .join("")}
          </div>
          <div>
            <strong>{user.name}</strong>
            <span>{adviser ? "Royal Square adviser" : "Client"}</span>
          </div>
        </div>
      </aside>
      <main className="rs-main">
        {demo && (
          <div className="rs-demo">
            <span>
              <b>Demo workspace</b> · Fictional clients and financial data
            </span>
            <label>
              Preview as
              <select
                aria-label="Demo user"
                value={user.id}
                disabled={busy}
                onChange={(event) => {
                  const id = event.target.value;
                  act(async () => {
                    await disablePush(api);
                    onSwitchUser(id);
                  }, "");
                }}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <header className="rs-header">
          <div>
            <h1>{navigation.find((t) => t[0] === tab)?.[1]}</h1>
            <p>
              {tab === "reminders"
                ? "A little preparation. A clearer financial future."
                : tab === "messages"
                  ? "Keep the conversation moving, all in one place."
                  : tab === "notifications"
                    ? "The updates that matter, ready when you are."
                    : tab === "rules"
                      ? "Build the follow-up rhythm for your practice."
                      : "Bring your financial position into focus."}
            </p>
          </div>
          <div className="rs-header-actions">
            <span className="rs-date">
              {dateLabel(new Date().toISOString())}
            </span>
            <ThemeToggle />
          </div>
        </header>
        {error && (
          <div className="rs-alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="rs-notice" role="status">
            {notice}
          </div>
        )}
        {loading ? (
          <div className="rs-card" role="status">
            Loading your workspace…
          </div>
        ) : (
          <>
            {tab === "reminders" && (
              <>
                <div className="rs-stats">
                  <div>
                    <span>Reminders</span>
                    <strong>{activeReminders.length}</strong>
                    <p>Open reminders</p>
                  </div>
                  <div>
                    <span>Notifications</span>
                    <strong>{unread}</strong>
                    <p>Unread updates</p>
                  </div>
                  <div>
                    <span>{adviser ? "Clients" : "Your adviser"}</span>
                    <strong>
                      {adviser ? data.clients.length : "Royal Square"}
                    </strong>
                    <p>
                      {adviser
                        ? "Clients in your book"
                        : "Your financial planning team"}
                    </p>
                  </div>
                </div>
                <section className="rs-card">
                  <div className="rs-section-head">
                    <div>
                      <h2>Plan ahead</h2>
                      <p>Reviews, renewals and the dates worth remembering.</p>
                    </div>
                    {adviser && (
                      <button
                        className="rs-primary"
                        disabled={busy || !data.clients.length}
                        onClick={() => setShowForm(!showForm)}
                      >
                        <Plus size={16} />
                        {showForm ? "Close form" : "Schedule reminder"}
                      </button>
                    )}
                  </div>
                  {showForm && (
                    <ReminderForm
                      clients={data.clients}
                      rules={data.rules.filter((r) => r.enabled)}
                      busy={busy}
                      onSubmit={async (body) => {
                        if (
                          await act(
                            () => api("/reminders", { method: "POST", body }),
                            "Reminder scheduled. Due reminders are checked every 30 seconds.",
                          )
                        )
                          setShowForm(false);
                      }}
                    />
                  )}
                  <div className="rs-filters" aria-label="Reminder filter">
                    {["active", "completed", "all"].map((value) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                      >
                        {value === "active"
                          ? "Open"
                          : value === "completed"
                            ? "Completed"
                            : "All reminders"}
                      </button>
                    ))}
                  </div>
                  {!visibleReminders.length ? (
                    <Empty
                      icon={CalendarDays}
                      title="Room to plan ahead"
                      body={
                        adviser
                          ? "Schedule a reminder for a client to start their follow-up plan."
                          : "Your adviser will add your reviews, renewals and important dates here."
                      }
                    />
                  ) : (
                    <div className="rs-list">
                      {visibleReminders.map((r) => (
                        <article key={r.id} className="rs-reminder">
                          <div className="rs-date-tile">
                            <b>{new Date(`${r.dueDate}T12:00:00`).getDate()}</b>
                            <span>
                              {new Date(
                                `${r.dueDate}T12:00:00`,
                              ).toLocaleDateString("en-ZA", { month: "short" })}
                            </span>
                          </div>
                          <div className="rs-grow">
                            <h3>{r.title}</h3>
                            <p>
                              {adviser && `${clientName(r.clientId)} · `}
                              {recurrence(r.repeatMonths)}
                            </p>
                            <small>
                              Due {dateLabel(r.dueDate)} · For{" "}
                              {r.audience === "both"
                                ? "client + advisers"
                                : r.audience}
                              {r.lastSentAt
                                ? ` · Last sent ${dateLabel(r.lastSentAt)}`
                                : ""}
                            </small>
                          </div>
                          <span className={`rs-badge ${r.status}`}>
                            {r.status === "active"
                              ? "Scheduled"
                              : r.status === "notified"
                                ? "Reminder sent"
                                : "Completed"}
                          </span>
                          {adviser && r.status !== "completed" && (
                            <button
                              className="rs-icon-button"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  () =>
                                    api(`/reminders/${r.id}/complete`, {
                                      method: "POST",
                                    }),
                                  "Reminder completed. Future repeats are stopped.",
                                )
                              }
                              aria-label={`Complete ${r.title}`}
                              title="Complete and stop future repeats"
                            >
                              <Check size={18} />
                            </button>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
            {tab === "rules" && adviser && (
              <Rules rules={data.rules} busy={busy} act={act} api={api} />
            )}
            {tab === "notifications" && (
              <>
                <section className="rs-card rs-push">
                  <div>
                    <h2>Stay in the loop</h2>
                    <p>
                      {pushConfig?.enabled
                        ? "Enable browser push to receive updates when this page is closed."
                        : "In-app updates are active. Browser push needs the server’s VAPID keys."}
                    </p>
                    <small>
                      Lock-screen display and sound follow your device settings.
                      Push previews hide private details.
                    </small>
                  </div>
                  <div className="rs-actions">
                    <button
                      className="rs-primary"
                      disabled={busy || !pushConfig?.enabled}
                      onClick={() =>
                        act(async () => {
                          await enablePush(api, pushConfig.publicKey);
                          setPushState("enabled");
                        }, "Push notifications enabled on this browser.")
                      }
                    >
                      Enable push
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await disablePush(api);
                          setPushState("disabled");
                        }, "Push disabled on this browser.")
                      }
                    >
                      Disable push
                    </button>
                  </div>
                  {pushState && (
                    <small>Push {pushState} on this browser.</small>
                  )}
                  <label className="rs-checkbox">
                    <input
                      type="checkbox"
                      checked={sound}
                      onChange={async (event) => {
                        const checked = event.target.checked;
                        if (checked) {
                          const Audio =
                            window.AudioContext || window.webkitAudioContext;
                          if (!Audio) {
                            setError(
                              "This browser does not support in-app sound.",
                            );
                            return;
                          }
                          audio.current ||= new Audio();
                          await audio.current.resume();
                        }
                        setSound(checked);
                      }}
                    />
                    Play a distinct chime for new updates while this page is
                    open
                  </label>
                </section>
                <section className="rs-card">
                  <div className="rs-section-head">
                    <div>
                      <h2>Your updates</h2>
                      <p>{unread} unread · Refreshes automatically</p>
                    </div>
                  </div>
                  {!data.notifications.length ? (
                    <Empty
                      icon={Bell}
                      title="You’re all caught up"
                      body="Reminders, messages and claim updates will appear here."
                    />
                  ) : (
                    data.notifications.map((n) => (
                      <article
                        className={`rs-notification ${n.readAt ? "" : "unread"}`}
                        key={n.id}
                      >
                        <Bell size={19} />
                        <div className="rs-grow">
                          <h3>{n.title}</h3>
                          <p>{n.body}</p>
                          <small>
                            {dateLabel(n.createdAt)} ·{" "}
                            {new Date(n.createdAt).toLocaleTimeString("en-ZA", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                        </div>
                        {!n.readAt && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  api(`/notifications/${n.id}/read`, {
                                    method: "PATCH",
                                  }),
                                "Marked as read.",
                              )
                            }
                          >
                            Mark read
                          </button>
                        )}
                      </article>
                    ))
                  )}
                </section>
              </>
            )}
            {tab === "messages" && (
              <Messages
                key={user.id}
                user={user}
                clients={data.clients}
                api={api}
                act={act}
                busy={busy}
              />
            )}
            {tab === "connections" && (
              <Connection
                clients={data.clients}
                api={api}
                act={act}
                busy={busy}
                demo={demo}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Empty({ icon: Icon, title, body }) {
  return (
    <div className="rs-empty">
      <Icon size={32} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function ReminderForm({ clients, rules, busy, onSubmit }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [ruleId, setRuleId] = useState(rules[0]?.id || "");
  const rule = rules.find((r) => r.id === ruleId);
  return (
    <form
      className="rs-form"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        onSubmit({
          clientId,
          ruleId,
          dueDate: values.get("dueDate"),
          audience: values.get("audience"),
          repeatMonths: Number(values.get("repeatMonths")),
        });
      }}
    >
      <ClientSelect clients={clients} value={clientId} onChange={setClientId} />
      <label>
        Reminder type
        <select
          value={ruleId}
          required
          onChange={(event) => setRuleId(event.target.value)}
        >
          {!rules.length && (
            <option value="">Add or enable a rule first</option>
          )}
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Due date
        <input type="date" name="dueDate" required />
      </label>
      <label>
        Notify
        <select
          key={`audience-${ruleId}`}
          name="audience"
          defaultValue={rule?.audience || "both"}
        >
          <option value="both">Client and advisers</option>
          <option value="client">Client only</option>
          <option value="adviser">Advisers only</option>
        </select>
      </label>
      <label>
        Repeat every (months; 0 = once)
        <input
          key={`months-${ruleId}`}
          type="number"
          name="repeatMonths"
          min="0"
          max="120"
          step="1"
          required
          defaultValue={rule?.repeatMonths || 0}
        />
      </label>
      <button className="rs-primary" disabled={busy || !rules.length}>
        Save reminder
      </button>
    </form>
  );
}

function Rules({ rules, api, act, busy }) {
  const [editing, setEditing] = useState(null);
  return (
    <section className="rs-card">
      <div className="rs-section-head">
        <div>
          <h2>A rhythm that grows with you</h2>
          <p>
            Add reminder types as the practice needs them. Pausing a type pauses
            its deliveries.
          </p>
        </div>
      </div>
      <form
        className="rs-form"
        key={editing?.id || "new"}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          const body = {
            title: fields.get("title"),
            audience: fields.get("audience"),
            repeatMonths: Number(fields.get("repeatMonths")),
            enabled: editing?.enabled ?? true,
          };
          if (
            await act(
              () =>
                api(editing ? `/rules/${editing.id}` : "/rules", {
                  method: editing ? "PUT" : "POST",
                  body,
                }),
              "Reminder rule saved. Existing schedules keep their original dates and intervals.",
            )
          ) {
            form.reset();
            setEditing(null);
          }
        }}
      >
        <label>
          Type name
          <input
            name="title"
            maxLength="200"
            required
            defaultValue={editing?.title || ""}
            placeholder="e.g. Passport renewal"
          />
        </label>
        <label>
          Default recipient
          <select name="audience" defaultValue={editing?.audience || "both"}>
            <option value="both">Client and advisers</option>
            <option value="client">Client only</option>
            <option value="adviser">Advisers only</option>
          </select>
        </label>
        <label>
          Repeat every (months; 0 = once)
          <input
            name="repeatMonths"
            type="number"
            min="0"
            max="120"
            step="1"
            required
            defaultValue={editing?.repeatMonths || 0}
          />
        </label>
        <div className="rs-actions">
          <button disabled={busy} className="rs-primary">
            {editing ? "Save changes" : "Add reminder type"}
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="rs-list">
        {rules.map((rule) => (
          <article className="rs-reminder" key={rule.id}>
            <Settings2 size={20} />
            <div className="rs-grow">
              <h3>{rule.title}</h3>
              <p>
                {recurrence(rule.repeatMonths)} ·{" "}
                {rule.audience === "both"
                  ? "Client and advisers"
                  : rule.audience}
              </p>
            </div>
            <span className="rs-badge">
              {rule.enabled ? "Enabled" : "Paused"}
            </span>
            <button disabled={busy} onClick={() => setEditing(rule)}>
              Edit
            </button>
            <button
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    api(`/rules/${rule.id}`, {
                      method: "PUT",
                      body: { ...rule, enabled: !rule.enabled },
                    }),
                  rule.enabled ? "Rule paused." : "Rule enabled.",
                )
              }
            >
              {rule.enabled ? "Pause" : "Enable"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Messages({ user, clients, api, act, busy }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  return (
    <section className="rs-card">
      <div className="rs-section-head">
        <div>
          <h2>
            {user.role === "adviser"
              ? "Client conversations"
              : "Talk to Royal Square"}
          </h2>
          <p>Both advisers can see and reply to your conversation.</p>
        </div>
        {user.role === "adviser" && (
          <ClientSelect
            clients={clients}
            value={clientId}
            onChange={setClientId}
          />
        )}
      </div>
      {clientId ? (
        <Thread
          key={clientId}
          clientId={clientId}
          user={user}
          api={api}
          act={act}
          busy={busy}
        />
      ) : (
        <Empty
          icon={MessageSquare}
          title="No conversations yet"
          body="A client record is needed to start messaging."
        />
      )}
    </section>
  );
}

function Thread({ clientId, user, api, act, busy }) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const result = await api(`/messages/${encodeURIComponent(clientId)}`);
        if (active) {
          setMessages(result);
          setError("");
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      } finally {
        fetching = false;
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [clientId, api]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="rs-thread" aria-label="Conversation">
        {loading ? (
          <p>Loading conversation…</p>
        ) : !messages.length ? (
          <Empty
            icon={MessageSquare}
            title="Start a conversation"
            body="Ask a question or share an update with your planning team."
          />
        ) : (
          messages.map((m) => (
            <article
              className={`rs-message ${m.senderId === user.id ? "mine" : ""}`}
              key={m.id}
            >
              <small>
                {m.senderName} · {m.senderRole}
              </small>
              <p>{m.body}</p>
              <time>
                {new Date(m.createdAt).toLocaleString("en-ZA", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </article>
          ))
        )}
      </div>
      <form
        className="rs-compose"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const body = new FormData(form).get("message");
          if (
            await act(async () => {
              const message = await api("/messages", {
                method: "POST",
                body: { clientId, body },
              });
              setMessages((previous) =>
                previous.some((m) => m.id === message.id)
                  ? previous
                  : [...previous, message],
              );
            }, "Message sent.")
          )
            form.reset();
        }}
      >
        <label htmlFor="rs-message-input">Your message</label>
        <textarea
          id="rs-message-input"
          name="message"
          maxLength="4000"
          rows="3"
          required
          placeholder="Write a message…"
        />
        <button className="rs-primary" disabled={busy}>
          Send message <ChevronRight size={16} />
        </button>
      </form>
    </>
  );
}

function Connection({ clients, api, act, busy, demo }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [snapshot, setSnapshot] = useState(null);
  return (
    <section className="rs-card">
      <div className="rs-section-head">
        <div>
          <h2>Your financial picture</h2>
          <p>Refresh a simulated snapshot from Ubuntu Demo Financial.</p>
        </div>
        <span className="rs-badge">Mock provider</span>
      </div>
      <ClientSelect
        clients={clients}
        value={clientId}
        disabled={busy}
        onChange={(id) => {
          setClientId(id);
          setSnapshot(null);
        }}
      />
      <div className="rs-connection-note">
        <Link2 size={24} />
        <div>
          <h3>Consent comes first</h3>
          <p>
            Every pull checks for valid, unexpired consent. The provider and all
            amounts shown here are fictional.
          </p>
          {demo && (
            <small>
              Demo scenario: Thandi has valid consent. Sipho has no valid
              consent.
            </small>
          )}
        </div>
      </div>
      <button
        className="rs-primary"
        disabled={busy || !clientId}
        onClick={() => {
          setSnapshot(null);
          act(
            async () =>
              setSnapshot(
                await api(`/financial-pull/${encodeURIComponent(clientId)}`, {
                  method: "POST",
                }),
              ),
            "Simulated financial position refreshed.",
          );
        }}
      >
        Refresh mock financial data
      </button>
      {snapshot && (
        <div className="rs-snapshot">
          <span className="rs-eyebrow">SIMULATED NET WORTH</span>
          <strong>
            {new Intl.NumberFormat("en-ZA", {
              style: "currency",
              currency: "ZAR",
            }).format(snapshot.netWorth)}
          </strong>
          <p>Assets less liabilities · {snapshot.currency}</p>
          <div className="rs-financial-lines">
            {snapshot.assets.map((a) => (
              <p key={a.name}>
                <span>{a.name}</span>
                <b>R {a.amount.toLocaleString("en-ZA")}</b>
              </p>
            ))}
            {snapshot.liabilities.map((l) => (
              <p key={l.name}>
                <span>{l.name}</span>
                <b>−R {l.amount.toLocaleString("en-ZA")}</b>
              </p>
            ))}
          </div>
          <small>
            {snapshot.source} · Updated{" "}
            {new Date(snapshot.pulledAt).toLocaleString("en-ZA")}
          </small>
        </div>
      )}
    </section>
  );
}
