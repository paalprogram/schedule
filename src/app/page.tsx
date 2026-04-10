"use client";
import { useSchedule, useCallouts, useReports } from "@/lib/hooks";
import { getWeekBounds, formatTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Calendar, AlertTriangle, PhoneOff, Users, Droplets, ArrowRight } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";

export default function DashboardPage() {
  const { weekStart, weekEnd } = getWeekBounds();
  const { data: schedule, error: scheduleErr, mutate: mutateSchedule } = useSchedule(weekStart, weekEnd);
  const { data: callouts, error: calloutsErr, mutate: mutateCallouts } = useCallouts(weekStart, weekEnd);
  const { data: report, error: reportErr, mutate: mutateReport } = useReports(weekStart, weekEnd);

  const totalShifts = schedule?.days?.reduce((acc: number, d: { shifts: unknown[] }) => acc + d.shifts.length, 0) || 0;
  const warnings = schedule?.warnings || [];
  const unresolvedCallouts = callouts?.filter((c: { resolved: number }) => !c.resolved) || [];
  const uncoveredCount = (report?.uncoveredShifts as unknown[])?.length || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-600 mt-1">Week of {weekStart} to {weekEnd}</p>
      </div>

      {(scheduleErr || calloutsErr || reportErr) && (
        <div className="mb-4">
          <ErrorBanner
            message="Some dashboard data failed to load."
            onRetry={() => { mutateSchedule(); mutateCallouts(); mutateReport(); }}
          />
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link href="/schedule" className="bg-white rounded-lg shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <Calendar size={16} /> Total Shifts
          </div>
          <div className="text-2xl sm:text-2xl sm:text-3xl font-bold text-gray-900">{totalShifts}</div>
        </Link>

        <Link href="/schedule" className="bg-white rounded-lg shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <AlertTriangle size={16} className="text-red-500" /> Uncovered
          </div>
          <div className={`text-2xl sm:text-3xl font-bold ${uncoveredCount > 0 ? "text-red-600" : "text-green-600"}`}>
            {uncoveredCount}
          </div>
        </Link>

        <Link href="/callouts" className="bg-white rounded-lg shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <PhoneOff size={16} className="text-orange-500" /> Active Callouts
          </div>
          <div className={`text-2xl sm:text-3xl font-bold ${unresolvedCallouts.length > 0 ? "text-orange-600" : "text-green-600"}`}>
            {unresolvedCallouts.length}
          </div>
        </Link>

        <Link href="/reports" className="bg-white rounded-lg shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <AlertTriangle size={16} className="text-yellow-500" /> Warnings
          </div>
          <div className={`text-2xl sm:text-3xl font-bold ${warnings.length > 0 ? "text-yellow-600" : "text-green-600"}`}>
            {warnings.length}
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Active callouts */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <PhoneOff size={16} /> Active Callouts
            </h2>
            <Link href="/callouts" className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="p-4">
            {unresolvedCallouts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No active callouts</p>
            ) : (
              <div className="space-y-3">
                {unresolvedCallouts.slice(0, 5).map((c: Record<string, unknown>) => (
                  <div key={c.id as number} className="flex items-center justify-between p-2 bg-red-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{c.student_name as string}</span>
                      <span className="text-gray-500 ml-2">{c.date as string} {formatTime(c.start_time as string)}</span>
                    </div>
                    <Badge variant="error">Needs coverage</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Warnings */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle size={16} /> Schedule Warnings
            </h2>
            <Link href="/reports" className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
              Full report <ArrowRight size={14} />
            </Link>
          </div>
          <div className="p-4">
            {warnings.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No warnings - schedule looks clean!</p>
            ) : (
              <div className="space-y-2">
                {warnings.slice(0, 8).map((w: { severity: string; message: string; type: string }, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant={w.severity === "error" ? "error" : "warning"}>{w.type.replace("_", " ")}</Badge>
                    <span className="text-gray-700">{w.message}</span>
                  </div>
                ))}
                {warnings.length > 8 && (
                  <p className="text-xs text-gray-500">+ {warnings.length - 8} more</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-lg shadow-sm border lg:col-span-2">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="font-semibold flex items-center gap-2">
              <Users size={16} /> Quick Stats
            </h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Staff Workload (Top 5)</h3>
              {(report?.staffLoadCounts as Array<{ staff_name: string; total_shifts: number }>)?.slice(0, 5).map((s, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1">
                  <span>{s.staff_name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 rounded-full h-2"
                        style={{ width: `${Math.min((s.total_shifts / 10) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-600 w-6 text-right">{s.total_shifts}</span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Droplets size={14} /> Swim Assignments
              </h3>
              {!(report?.swimCounts as unknown[])?.length ? (
                <p className="text-sm text-gray-500">None this week</p>
              ) : (
                (report?.swimCounts as Array<{ staff_name: string; swim_count: number }>)?.map((s, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1">
                    <span>{s.staff_name}</span>
                    <Badge variant={s.swim_count > 2 ? "warning" : "info"}>{s.swim_count} swim</Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
