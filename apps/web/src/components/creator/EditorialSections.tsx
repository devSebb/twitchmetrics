"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Container, SectionHeading } from "@/components/ui/Editorial";

export type EditorialSection = {
  id: string;
  title: string;
  label?: string;
  /** Static information remains useful even when optional widgets are empty. */
  keepVisible?: boolean;
  content: ReactNode;
};

export function EditorialSections({
  sections,
  navigationLabel = "Creator sections",
}: {
  sections: EditorialSection[];
  navigationLabel?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState<string[]>([]);
  // Public widgets can discover no data after hydration. Keep them mounted so
  // refetches recover, but omit their empty section and navigation destination.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => {
      const next = Array.from(
        element.querySelectorAll<HTMLElement>("[data-profile-section]"),
      )
        .filter((section) => {
          if (section.hasAttribute("data-keep-visible")) return false;
          const widgets = Array.from(
            section.querySelectorAll("[data-widget-id]"),
          );
          return (
            widgets.length > 0 &&
            widgets.every((widget) =>
              widget.querySelector("[data-widget-empty]"),
            )
          );
        })
        .map((section) => section.id);
      setEmpty((current) => (current.join() === next.join() ? current : next));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [sections]);
  const visible = sections.filter((section) => !empty.includes(section.id));
  return (
    <>
      {visible.length > 0 && (
        <nav
          aria-label={navigationLabel}
          className="sticky top-[88px] z-30 border-b border-n-line bg-white/95 backdrop-blur-sm"
        >
          <Container>
            <div className="flex gap-7 overflow-x-auto py-4 text-sm font-semibold">
              {visible.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="shrink-0 py-1 capitalize text-n-slate hover:text-n-red"
                >
                  {section.label ?? section.id}
                </a>
              ))}
            </div>
          </Container>
        </nav>
      )}
      <Container>
        <div ref={root} className="py-6 sm:py-10">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              data-profile-section
              data-keep-visible={section.keepVisible ? true : undefined}
              hidden={empty.includes(section.id)}
              aria-labelledby={`${section.id}-heading`}
              className="py-10 sm:py-14"
            >
              <SectionHeading
                number={String(index + 1).padStart(2, "0")}
                title={section.title}
                id={`${section.id}-heading`}
              />
              {section.content}
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
