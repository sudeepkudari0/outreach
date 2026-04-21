"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Loader2 } from "lucide-react";

export default function StatsCharts() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.stats.get(),
    refetchInterval: 30000,
  });

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
      </div>
    );
  }

  // Format data for Recharts
  const dailyData = stats.sent_per_day.map(
    (d: { date: string; count: number }) => ({
      name: new Date(d.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      count: d.count,
    }),
  );

  const siteData = Object.entries(stats.by_site).map(([site, data]) => ({
    name: site as string,
    found: (data as { found: number })?.found,
    sent: (data as { sent: number })?.sent,
  }));

  const reachLimit = stats.sent_today >= stats.daily_limit;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Stat Cards */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl text-center">
          <p className="text-sm font-medium text-neutral-400 mb-1">
            Total Found
          </p>
          <p className="text-3xl font-bold text-neutral-100">
            {stats.total_found}
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl text-center">
          <p className="text-sm font-medium text-neutral-400 mb-1">
            Total Sent
          </p>
          <p className="text-3xl font-bold text-blue-400">{stats.total_sent}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl text-center">
          <p className="text-sm font-medium text-neutral-400 mb-1">
            Total Replied
          </p>
          <p className="text-3xl font-bold text-green-400">
            {stats.total_replied}
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl text-center">
          <p className="text-sm font-medium text-neutral-400 mb-1">
            Reply Rate
          </p>
          <p className="text-3xl font-bold text-purple-400">
            {stats.reply_rate}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Send Limit */}
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl flex flex-col justify-center items-center">
          <h3 className="text-sm font-medium text-neutral-400 mb-6 uppercase tracking-wider">
            Today's Progress
          </h3>

          <div className="relative size-40 flex items-center justify-center">
            <svg
              viewBox="0 0 36 36"
              className="w-full h-full transform -rotate-90"
            >
              <path
                className="text-neutral-800"
                d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className={`${reachLimit ? "text-red-500" : "text-blue-500"} transition-all duration-1000 ease-out`}
                strokeDasharray={`${Math.min((stats.sent_today / stats.daily_limit) * 100, 100)}, 100`}
                d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span
                className={`text-4xl font-bold tracking-tighter ${reachLimit ? "text-red-400" : "text-neutral-100"}`}
              >
                {stats.sent_today}
              </span>
              <span className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">
                out of {stats.daily_limit}
              </span>
            </div>
          </div>
          {reachLimit && (
            <p className="mt-4 text-xs text-red-400 font-medium bg-red-400/10 px-3 py-1 rounded-full">
              Daily limit reached
            </p>
          )}
        </div>

        {/* Radar/Bar Chart for Sites */}
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl">
          <h3 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider">
            Performance by Site
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={siteData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#262626"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="#525252"
                  tick={{ fill: "#737373", fontSize: 12 }}
                />
                <YAxis
                  stroke="#525252"
                  tick={{ fill: "#737373", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "#262626" }}
                  contentStyle={{
                    backgroundColor: "#171717",
                    borderColor: "#262626",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="found"
                  name="Found"
                  fill="#525252"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="sent"
                  name="Sent"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl">
        <h3 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider">
          Send History (Last 30 Days)
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={dailyData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#262626"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                stroke="#525252"
                tick={{ fill: "#737373", fontSize: 12 }}
                tickMargin={10}
                minTickGap={20}
              />
              <YAxis
                stroke="#525252"
                tick={{ fill: "#737373", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#171717",
                  borderColor: "#262626",
                  borderRadius: "8px",
                }}
                itemStyle={{ color: "#3b82f6" }}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Emails Sent"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{
                  fill: "#171717",
                  stroke: "#3b82f6",
                  strokeWidth: 2,
                  r: 4,
                }}
                activeDot={{ r: 6, fill: "#3b82f6" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
