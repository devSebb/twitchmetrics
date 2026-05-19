"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type FaqItem = {
  question: string;
  answer: string;
};

type FaqAccordionProps = {
  items: readonly FaqItem[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-[#3F4147] overflow-hidden rounded-2xl border border-[#3F4147] bg-[#313338]">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#383A40]"
            >
              <span className="text-base font-semibold text-[#F2F3F5]">
                {item.question}
              </span>
              <CaretDown
                size={18}
                weight="bold"
                className={cn(
                  "shrink-0 text-[#949BA4] transition-transform",
                  isOpen ? "rotate-180" : "rotate-0",
                )}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-5 text-sm leading-relaxed text-[#DBDEE1]">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
