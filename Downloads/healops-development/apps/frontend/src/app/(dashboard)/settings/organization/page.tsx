"use client";

import { useState } from "react";
import { Save, UserPlus, Trash2, Shield } from "lucide-react";
import type { Member } from "@/app/_libs/types/settings";

const MOCK_MEMBERS: Member[] = [
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
  const [orgName, setOrgName] = useState("My Organization");
  const [inviteEmail, setInviteEmail] = useState("");
  const [members] = useState<Member[]>(MOCK_MEMBERS);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Organization</h2>
        <p className="text-sm text-muted-foreground">
          Manage your organization settings and team members
        </p>
      </div>

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
          <button className="flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90">
            <Save className="size-3.5" />
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
              placeholder="email@example.com"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-brand-cyan/50"
            />
            <button className="flex items-center gap-1.5 rounded-lg bg-brand-cyan/10 px-3 py-1.5 text-sm font-medium text-brand-cyan transition-all hover:bg-brand-cyan/20">
              <UserPlus className="size-3.5" />
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
                <button className="rounded p-1 text-muted-foreground transition-all hover:bg-red-400/10 hover:text-red-400">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
