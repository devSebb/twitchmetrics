"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button, Card, Skeleton } from "@/components/ui";

const ROLE_OPTIONS = [
  { value: "", label: "All Roles" },
  { value: "creator", label: "Creator" },
  { value: "talent_manager", label: "Talent Manager" },
  { value: "admin", label: "Admin" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  admin: "text-[#E32C19] bg-[#E32C19]/10",
  talent_manager: "text-[#3b82f6] bg-[#3b82f6]/10",
  creator: "text-[#22c55e] bg-[#22c55e]/10",
};

export function UserManagement() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.listUsers.useQuery({
    search: search || undefined,
    role: (roleFilter as "creator" | "talent_manager" | "admin") || undefined,
    page,
    limit,
  });

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: async () => {
      await utils.admin.listUsers.invalidate();
    },
  });

  const suspendUser = trpc.admin.suspendUser.useMutation({
    onSuccess: async () => {
      await utils.admin.listUsers.invalidate();
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or email..."
          className="flex-1 rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none focus:border-[#4E5058]"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] outline-none"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-[#949BA4]">
        {total} user{total !== 1 ? "s" : ""} found
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-[#949BA4]">No users match your filters.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#3F4147]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#3F4147] bg-[#2B2D31]">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  User
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Role
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Joined
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[#949BA4]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3F4147] bg-[#313338]">
              {items.map((user) => (
                <tr key={user.id} className="hover:bg-[#383A40]/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#F2F3F5]">
                      {user.name ?? "Unnamed"}
                    </p>
                    <p className="text-xs text-[#949BA4]">
                      {user.email ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => {
                        updateRole.mutate({
                          userId: user.id,
                          role: e.target.value as
                            | "creator"
                            | "talent_manager"
                            | "admin",
                        });
                      }}
                      className={`rounded-full border-0 px-2 py-0.5 text-[10px] font-medium outline-none cursor-pointer ${ROLE_COLORS[user.role] ?? ROLE_COLORS.creator}`}
                    >
                      <option value="creator">Creator</option>
                      <option value="talent_manager">Talent Manager</option>
                      <option value="brand">Brand</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${user.suspended ? "bg-[#ef4444]/10 text-[#ef4444]" : "bg-[#22c55e]/10 text-[#22c55e]"}`}
                    >
                      {user.suspended ? "Suspended" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#949BA4]">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        suspendUser.mutate({
                          userId: user.id,
                          suspended: !user.suspended,
                        })
                      }
                    >
                      {user.suspended ? "Unsuspend" : "Suspend"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((v) => Math.max(1, v - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-[#949BA4]">
          Page {page} of {pageCount}
        </p>
        <button
          type="button"
          onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
          disabled={page >= pageCount}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
