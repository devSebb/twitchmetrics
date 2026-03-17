"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { getSafeImageSrc } from "@/lib/safeImage";

type HeaderUserMenuProps = {
  name: string | null;
  image: string | null;
};

export function HeaderUserMenu({ name, image }: HeaderUserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayName = name ?? "User";
  const avatarSrc = image ? getSafeImageSrc(image) : null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[#DBDEE1] transition-colors hover:bg-[#383A40]"
      >
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt={displayName}
            width={26}
            height={26}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#383A40] text-xs font-bold text-[#F2F3F5]">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="hidden max-w-[120px] truncate sm:block">
          {displayName}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[#3F4147] bg-[#1E1F22] py-1 shadow-xl">
          <Link
            href="/dashboard"
            className="block px-4 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/settings"
            className="block px-4 py-2 text-sm text-[#DBDEE1] hover:bg-[#313338]"
          >
            Settings
          </Link>
          <div className="my-1 border-t border-[#3F4147]" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="block w-full px-4 py-2 text-left text-sm text-[#949BA4] hover:bg-[#313338] hover:text-[#DBDEE1]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
