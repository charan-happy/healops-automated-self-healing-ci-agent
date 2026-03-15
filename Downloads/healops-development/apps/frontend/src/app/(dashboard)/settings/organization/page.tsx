"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, UserPlus, Trash2, Shield, Loader2, Mail, X } from "lucide-react";
import type { Member } from "@/app/_libs/types/settings";
import {
  fetchOrganization,
  updateOrganization,
  fetchMembers,
  inviteMember,
  removeMember,
  fetchInvitations,
  revokeInvitation,
  isDemoMode,
  type Invitation,
} from "@/app/_libs/healops-api";
import { useOrg } from "@/app/_libs/context/OrgContext";

const DEMO_MEMBERS: Member[] = [
  {
    id: "1",
    userId: "u1",
    email: "admin@example.com",
    name: "Admin User",
    role: "owner",
    joinedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    userId: "u2",
    email: "dev@example.com",
    name: "Developer",
    role: "member",
    joinedAt: "2024-02-01T00:00:00Z",
  },
];

export default function OrganizationSettingsPage() {
  const { refresh: refreshOrg } = useOrg();
  const [orgName, setOrgName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Load org data on mount
  useEffect(() => {
    async function load() {
      if (isDemoMode()) {
        setOrgName("My Organization");
        setOriginalName("My Organization");
        setMembers(DEMO_MEMBERS);
        setLoading(false);
        return;
      }
      try {
        const [org, memberList, invitationList] = await Promise.all([
          fetchOrganization(),
          fetchMembers(),
          fetchInvitations(),
        ]);
        if (org) {
          setOrgName(org.name);
          setOriginalName(org.name);
        }
        if (memberList) setMembers(memberList);
        if (invitationList) setInvitations(invitationList);
      } catch {
        showMessage("error", "Failed to load organization data");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [showMessage]);

  const handleSave = useCallback(async () => {
    if (!orgName.trim() || orgName === originalName) return;
    if (isDemoMode()) {
      setOriginalName(orgName);
      showMessage("success", "Organization name updated (demo)");
      return;
    }
    setSaving(true);
    const result = await updateOrganization({ name: orgName.trim() });
    setSaving(false);
    if (result) {
      setOriginalName(result.name);
      showMessage("success", "Organization name updated");
      // Refresh sidebar org name immediately
      void refreshOrg();
    } else {
      showMessage("error", "Failed to update organization");
    }
  }, [orgName, originalName, showMessage]);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    if (isDemoMode()) {
      setInvitations((prev) => [
        ...prev,
        {
          id: `demo-${Date.now()}`,
          email: inviteEmail.trim(),
          role: "member",
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);
      setInviteEmail("");
      showMessage("success", "Invitation sent (demo)");
      return;
    }
    setInviting(true);
    const result = await inviteMember(inviteEmail.trim());
    setInviting(false);
    if (result) {
      setInvitations((prev) => [...prev, result]);
      setInviteEmail("");
      showMessage("success", `Invitation sent to ${result.email}`);
    } else {
      showMessage("error", "Failed to send invitation");
    }
  }, [inviteEmail, showMessage]);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (isDemoMode()) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        showMessage("success", "Member removed (demo)");
        return;
      }
      setRemovingId(userId);
      const ok = await removeMember(userId);
      setRemovingId(null);
      if (ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        showMessage("success", "Member removed");
      } else {
        showMessage("error", "Failed to remove member");
      }
    },
    [showMessage],
  );

  const handleRevokeInvitation = useCallback(
    async (id: string) => {
      if (isDemoMode()) {
        setInvitations((prev) => prev.filter((inv) => inv.id !== id));
        showMessage("success", "Invitation revoked (demo)");
        return;
      }
      setRevokingId(id);
      const ok = await revokeInvitation(id);
      setRevokingId(null);
      if (ok) {
        setInvitations((prev) => prev.filter((inv) => inv.id !== id));
        showMessage("success", "Invitation revoked");
      } else {
        showMessage("error", "Failed to revoke invitation");
      }
    },
    [showMessage],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Organization</h2>
        <p className="text-sm text-muted-foreground">
          Manage your organization settings and team members
        </p>
      </div>

      {/* Toast message */}
      {message && (
        <div
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-400/10 text-emerald-400"
              : "bg-red-400/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Org name */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-4 text-sm font-semibold">General</h3>
        <div className="max-w-md space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Organization name
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-all focus:border-brand-cyan/50"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !orgName.trim() || orgName === originalName}
            className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Team Members</h3>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleInvite();
              }}
              placeholder="email@example.com"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-cyan/10 px-3 py-1.5 text-sm font-medium text-brand-cyan transition-all hover:bg-brand-cyan/20 disabled:opacity-50"
            >
              {inviting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UserPlus className="size-3.5" />
              )}
              Invite
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
            >
              <div className="flex size-8 items-center justify-center rounded-full bg-brand-cyan/10 text-xs font-bold text-brand-cyan">
                {m.name.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Shield className="size-3" />
                {m.role}
              </span>
              {m.role !== "owner" && (
                <button
                  onClick={() => handleRemoveMember(m.userId)}
                  disabled={removingId === m.userId}
                  className="rounded p-1 text-muted-foreground transition-all hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                >
                  {removingId === m.userId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-sm font-semibold">Pending Invitations</h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-amber-400/10 text-xs font-bold text-amber-400">
                  <Mail className="size-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                  {inv.role}
                </span>
                <button
                  onClick={() => handleRevokeInvitation(inv.id)}
                  disabled={revokingId === inv.id}
                  className="rounded p-1 text-muted-foreground transition-all hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                >
                  {revokingId === inv.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
