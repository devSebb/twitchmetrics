"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/**
 * Feedback for the /creators filters.
 *
 * A filter click only changes the query string, so Next keeps the old list on
 * screen until the server answers, sometimes for seconds, and the clicked
 * control did not even look selected (Stream Hatchet review, 2026-11-25).
 * Every control navigates through here: the choice shows as selected at once
 * and the list is marked busy until the new page commits.
 */
type Choice = {
  platform?: string;
  sort?: string;
  view?: string;
  game?: string;
};

type CreatorNavigation = {
  /** True from the click until the new list is on screen. */
  isPending: boolean;
  /** What was just chosen; only meaningful while isPending. */
  choice: Choice;
  navigate: (href: string, choice?: Choice) => void;
};

const CreatorNavigationContext = createContext<CreatorNavigation | null>(null);

export function CreatorNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Choice>({});

  const navigate = useCallback(
    (href: string, next: Choice = {}) => {
      setChoice(next);
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({ isPending, choice: isPending ? choice : {}, navigate }),
    [isPending, choice, navigate],
  );

  return (
    <CreatorNavigationContext.Provider value={value}>
      {children}
    </CreatorNavigationContext.Provider>
  );
}

/** Outside a provider the controls still navigate, without the feedback. */
export function useCreatorNavigation(): CreatorNavigation {
  const context = useContext(CreatorNavigationContext);
  const router = useRouter();
  return useMemo(
    () =>
      context ?? {
        isPending: false,
        choice: {},
        navigate: (href: string) => router.push(href),
      },
    [context, router],
  );
}
