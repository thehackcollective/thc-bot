"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role, User } from "@/lib/auth";
import { useToast } from "@/components/ToastProvider";

export default function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((j) => setUsers(j.users ?? []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        toast(j.error || "Could not create user", "error");
        return;
      }
      toast(`Created ${role === "super_admin" ? "super admin" : "admin"} “${j.user.username}”`, "ok");
      setUsername("");
      setPassword("");
      setRole("admin");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: User) {
    if (!confirm(`Delete user “${u.username}”? This cannot be undone.`)) return;
    const r = await fetch(`/api/users?id=${u.id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok || !j.ok) return toast(j.error || "Could not delete user", "error");
    toast(`Deleted “${u.username}”`, "ok");
    load();
  }

  return (
    <>
      <div className="page-head">
        <h1>Admins</h1>
        <p>Manage who can sign in to the console. Only the super admin can add or remove users.</p>
      </div>

      <div className="panel">
        <h3>Add a user</h3>
        <p className="hint">New users can sign in immediately with the credentials you set here.</p>
        <form onSubmit={create}>
          <div className="field">
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Password (min 8 characters)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </div>
          <button type="submit" className="login-btn" style={{ width: "auto" }} disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h3>Users</h3>
        <p className="hint">{users.length} account{users.length === 1 ? "" : "s"}.</p>
        {users.map((u) => (
          <div className="row" key={u.id}>
            <div className="rl">
              <strong>{u.username}</strong>{" "}
              <span className={`role-tag ${u.role}`}>
                {u.role === "super_admin" ? "super admin" : "admin"}
              </span>
              <small>
                Added {new Date(u.createdAt).toLocaleDateString()}
                {u.createdBy ? ` by ${u.createdBy}` : ""}
              </small>
            </div>
            {u.role === "super_admin" ? (
              <span className="mono" style={{ color: "var(--text-faint)", fontSize: 12.5 }}>
                protected
              </span>
            ) : (
              <button className="btn ghost" onClick={() => remove(u)}>
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
