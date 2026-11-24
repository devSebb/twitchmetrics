"use client";
import { useState } from "react";
import { BaseChart } from "@/components/charts/BaseChart";
import { Button } from "@/components/ui/Button";
import { Container, SectionHeading } from "@/components/ui/Editorial";
import { Wordmark } from "@/components/brand/Wordmark";
import { NOTICED, NOTICED_CHART_COLORS } from "@/lib/constants/noticed";

/** Development-only specimen. All chart and table figures are labelled fixtures. */
export function DesignSpecimen() {
  const [period, setPeriod] = useState("7D");
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="noticed">
      <div className="bg-n-ink py-14 text-white">
        <Container>
          <Wordmark attribution={false} />
          <p className="n-eyebrow mt-8 text-white/70">
            Development specimen · illustrative data only
          </p>
          <h1 className="mt-4 text-5xl font-extrabold tracking-tight">
            A system built for the detail.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80">
            Responsive typography, readable analytics and clear controls. This
            page is unavailable in production.
          </p>
        </Container>
      </div>
      <Container className="space-y-16 py-16">
        <section>
          <SectionHeading number="01" title="Brand and colour" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Object.entries(NOTICED)
              .filter(([key]) => key !== "font")
              .map(([name, value]) => (
                <div key={name} className="border border-n-line p-3">
                  <div
                    className="h-20 border border-n-line"
                    style={{ background: value }}
                  />
                  <p className="mt-3 text-sm font-bold">{name}</p>
                  <p className="text-xs text-n-slate">{value}</p>
                </div>
              ))}
          </div>
        </section>
        <section>
          <SectionHeading number="02" title="Controls and states" />
          <div className="flex flex-wrap gap-3">
            <Button appearance="noticed">Save changes</Button>
            <Button appearance="noticed" variant="secondary">
              Cancel
            </Button>
            <Button appearance="noticed" variant="ghost">
              Preview
            </Button>
            <Button appearance="noticed" disabled>
              Saving…
            </Button>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Display name
              <input className="n-input mt-2" defaultValue="Sample creator" />
            </label>
            <label className="text-sm font-semibold">
              Platform
              <select className="n-input mt-2">
                <option>All platforms</option>
                <option>Twitch</option>
                <option>YouTube</option>
              </select>
            </label>
            <div>
              <label htmlFor="specimen-error" className="text-sm font-semibold">
                Email address
              </label>
              <input
                id="specimen-error"
                className="n-input mt-2"
                aria-invalid="true"
                aria-describedby="specimen-error-help"
                defaultValue="invalid example"
              />
              <p id="specimen-error-help" className="mt-2 text-sm text-n-error">
                Enter a valid email address.
              </p>
            </div>
            <label className="text-sm font-semibold">
              Read-only example
              <input className="n-input mt-2" value="Unavailable" disabled />
            </label>
          </div>
          <label className="mt-7 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-n-red"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Show this sample section
          </label>
          <p className="mt-5 text-sm text-n-success" role="status">
            Changes saved. Sample success message.
          </p>
          <p className="mt-2 text-sm text-n-warning">
            Limited history. Sample warning message.
          </p>
        </section>
        <section>
          <SectionHeading number="03" title="Analytics" />
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">Follower history</h3>
              <p className="mt-2 text-sm text-n-slate">
                Illustrative series. Not live creator data.
              </p>
            </div>
            <div
              role="group"
              aria-label="Example period"
              className="flex gap-2"
            >
              {["7D", "30D"].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={period === value}
                  className={`n-button ${period === value ? "n-button-primary" : "n-button-secondary"}`}
                  onClick={() => setPeriod(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <BaseChart
            appearance="noticed"
            height={320}
            option={{
              animation: false,
              tooltip: { trigger: "axis", confine: true },
              legend: { top: 0 },
              grid: {
                left: 20,
                right: 20,
                top: 50,
                bottom: 65,
                containLabel: true,
              },
              xAxis: {
                type: "category",
                data:
                  period === "7D"
                    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                    : ["1", "5", "10", "15", "20", "25", "30"],
              },
              yAxis: { type: "value" },
              dataZoom: [{ type: "slider", bottom: 5, height: 20 }],
              series: [
                {
                  name: "Twitch",
                  type: "line",
                  step: "end",
                  data: [120, 130, 130, 150, 160, 180, 200],
                  itemStyle: { color: NOTICED_CHART_COLORS.twitch },
                },
                {
                  name: "YouTube",
                  type: "line",
                  step: "end",
                  data: [85, 90, 110, 120, 145, 155, 170],
                  itemStyle: { color: NOTICED_CHART_COLORS.youtube },
                },
              ],
            }}
          />
          <p className="mt-4 text-sm text-n-slate">
            Sample period ends at 200 Twitch followers and 170 YouTube
            subscribers.
          </p>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-4 text-lg font-bold">
                Platform comparison · sample
              </h3>
              <BaseChart
                appearance="noticed"
                height={220}
                option={{
                  animation: false,
                  grid: {
                    left: 10,
                    right: 25,
                    top: 10,
                    bottom: 10,
                    containLabel: true,
                  },
                  xAxis: { type: "value" },
                  yAxis: { type: "category", data: ["YouTube", "Twitch"] },
                  series: [
                    {
                      type: "bar",
                      data: [170, 200],
                      itemStyle: { color: NOTICED.navy },
                      barMaxWidth: 24,
                    },
                  ],
                }}
              />
            </div>
            <div>
              <h3 className="mb-4 text-lg font-bold">Empty / loading states</h3>
              <BaseChart appearance="noticed" option={{}} height={90} />
              <div className="mt-4">
                <BaseChart
                  appearance="noticed"
                  option={{}}
                  height={90}
                  loading
                />
              </div>
            </div>
          </div>
        </section>
        <section>
          <SectionHeading number="04" title="Dense information" />
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Sample streams table"
          >
            <table className="n-table min-w-[640px]">
              <caption className="sr-only">
                Illustrative stream records, not real analytics
              </caption>
              <thead>
                <tr>
                  {[
                    "Stream",
                    "Platform",
                    "Duration",
                    "Average viewers",
                    "Peak viewers",
                  ].map((heading) => (
                    <th key={heading} scope="col">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((row) => (
                  <tr key={row}>
                    <th scope="row">Sample stream {row}</th>
                    <td>Twitch</td>
                    <td>2h 30m</td>
                    <td>1,200</td>
                    <td>1,500</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Container>
    </div>
  );
}
