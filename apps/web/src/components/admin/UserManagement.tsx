"use client";

import { useState } from "react";
import { QueryError } from "@/components/ui/QueryError";
import { trpc } from "@/lib/trpc";
import { Button, Card, Skeleton } from "@/components/ui";

const ROLE_OPTIONS = [
  { value: "", label: "All Roles" },
  { value: "creator", label: "Creator" },
  { value: "talent_manager", label: "Talent Manager" },
  { value: "admin", label: "Admin" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  admin: "text-n-red bg-n-red/10",
  talent_manager: "text-n-navy bg-n-navy/10",
  creator: "text-n-success bg-n-success/10",
};

export function UserManagement() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.admin.listUsers.useQuery({
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
      {(updateRole.error || suspendUser.error) && (
        <p role="alert" className="text-sm text-n-error">
          {updateRole.error?.message ?? suspendUser.error?.message}
        </p>
      )}
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          aria-label="Search users"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or email..."
          className="min-w-0 basis-full sm:basis-auto flex-1 rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none focus:border-n-control"
        />
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink outline-none"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-n-slate">
        {total} user{total !== 1 ? "s" : ""} found
      </div>

      {isError ? (
        <QueryError label="users" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-n-slate">No users match your filters.</p>
        </Card>
      ) : (
        <div
          role="region"
          aria-label="Users table"
          tabIndex={0}
          className="overflow-x-auto border-y border-n-line"
        >
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Users</caption>
            <thead className="border-b border-n-line bg-n-surface">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  User
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Role
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Joined
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-medium text-n-slate"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n-line bg-white">
              {items.map((user) => (
                <tr key={user.id} className="hover:bg-n-surface/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-n-ink">
                      {user.name ?? "Unnamed"}
                    </p>
                    <p className="text-xs text-n-slate">{user.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Role for ${user.name ?? user.email ?? "user"}`}
                      disabled={updateRole.isPending}
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
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${user.suspended ? "bg-n-error/10 text-n-error" : "bg-n-success/10 text-n-success"}`}
                    >
                      {user.suspended ? "Suspended" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-n-slate">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={suspendUser.isPending}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPage((v) => Math.max(1, v - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-n-slate">
          Page {page} of {pageCount}
        </p>
        <button
          type="button"
          onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
          disabled={page >= pageCount}
          className="rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
