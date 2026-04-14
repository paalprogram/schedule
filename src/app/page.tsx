"use client";
import { useSchedule, useCallouts, useReports, useStaff } from "@/lib/hooks";
import { getWeekBounds, formatTime, SHORT_DAYS } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Calendar, AlertTriangle, PhoneOff, Users, Droplets, ArrowRight,
  CheckCircle, Clock, UserCheck, UserX,
} from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";

export default function DashboardPage() {
  const today = new Date().toISOString().split("T")[0];
  const { weekStart, weekEnd } = getWeekBounds();
  const { data: schedule, error: scheduleErr, mutate: mutateSchedule } = useSchedule(weekStart, weekEnd);
  const { data: callouts, error: calloutsErr, mutate: mutateCallouts } = useCallouts(weekStart, weekEnd);
  const { data: report, error: reportErr, mutate: mutateReport } = useReports(weekStart, weekEnd);
  const { data: allStaff } = useStaff();

  const totalShifts = schedule?.days?.reduce((acc: number, d: { shifts: unknown[] }) => acc + d.shifts.length, 0) || 0;
  const warnings = schedule?.warnings || [];
  const unresolvedCallouts = callouts?.filter((c: { resolved: number }) => !c.resolved) || [];
  const errorWarnings = warnings.filter((w: { severity: string }) => w.severity === "error");

  // Today's data
  const todayData = schedule?.days?.find((d: { date: string }) => d.date === today);
  const todayShifts = (todayData?.shifts || []) as Array<Record<string, unknown>>;
  const todayOpen = todayShifts.filter((s: Record<string, unknown>) => !s.assigned_staff_id || s.status === "open");
  const todayAssigned = todayShifts.filter((s: Record<string, unknown>) => s.assigned_staff_id && s.status !== "open");
  const todayUnassignedStaff: Array<{ id: number; name: string }> = schedule?.unassignedStaff?.[today] || [];

  // 2:1 coverage
  const needs2to1 = todayShifts.filter((s: Record<string, unknown>) =>
    ((s.staffing_ratio as number) || 1) >= 2 && s.assigned_staff_id && !s.second_staff_id
  );
  const full2to1 = todayShifts.filter((s: Record<string, unknown>) =>
    ((s.staffing_ratio as number) || 1) >= 2 && s.assigned_staff_id && s.second_staff_id
  );

  // Day-by-day coverage for the week
  const dayCoverage = schedule?.days?.map((d: { date: string; dayName: string; shifts: Array<Record<string, unknown>> }) => {
    const total = d.shifts.length;
    const open = d.shifts.filter((s: Record<string, unknown>) => !s.assigned_staff_id || s.status === "open").length;
    const covered = total - open;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 100;
    return { date: d.date, dayName: d.dayName, total, open, covered, pct };
  }) || [];

  // Staff workload
  const staffLoad = (report?.staffLoadCounts as Array<{ staff_name: string; total_shifts: number }>) || [];
  const maxLoad = Math.max(...staffLoad.map(s => s.total_shifts), 1);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Week of {weekStart} to {weekEnd}</p>
        </div>
        <Link href="/schedule" className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
          Open Schedule <ArrowRight size={14} />
        </Link>
      </div>

      {(scheduleErr || calloutsErr || reportErr) && (
        <div className="mb-4">
          <ErrorBanner
            message="Some dashboard data failed to load."
            onRetry={() => { mutateSchedule(); mutateCallouts(); mutateReport(); }}
          />
        </div>
      )}

      {/* Today's snapshot */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 sm:p-5 mb-6 text-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock size={18} /> Today &mdash; {today}
          </h2>
          {todayOpen.length === 0 && todayShifts.length > 0 && (
            <span className="flex items-center gap-1 text-green-200 text-sm font-medium">
              <CheckCircle size={14} /> All shifts covered
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/15 rounded-lg px-3 py-2">
            <div className="text-blue-100 text-xs">Total Shifts</div>
            <div className="text-2xl font-bold">{todayShifts.length}</div>
          </div>
          <div className="bg-white/15 rounded-lg px-3 py-2">
            <div className="text-blue-100 text-xs">Covered</div>
            <div className="text-2xl font-bold text-green-200">{todayAssigned.length}</div>
          </div>
          <div className="bg-white/15 rounded-lg px-3 py-2">
            <div className="text-blue-100 text-xs">Open</div>
            <div className={`text-2xl font-bold ${todayOpen.length > 0 ? "text-red-300" : "text-green-200"}`}>{todayOpen.length}</div>
          </div>
          <div className="bg-white/15 rounded-lg px-3 py-2">
            <div className="text-blue-100 text-xs">Staff Available</div>
            <div className="text-2xl font-bold">{todayUnassignedStaff.length}</div>
          </div>
        </div>
        {needs2to1.length > 0 && (
          <div className="mt-3 bg-yellow-500/20 border border-yellow-300/30 rounded-lg px-3 py-2 text-sm">
            <span className="font-medium">{needs2to1.length} shift{needs2to1.length !== 1 ? "s" : ""} still need a 2nd staff member</span>
            {" "}({needs2to1.map((s: Record<string, unknown>) => s.student_name as string).join(", ")})
          </div>
        )}
      </div>

      {/* Week at a glance */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Week Coverage</h2>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {dayCoverage.map((d: { date: string; dayName: string; total: number; open: number; covered: number; pct: number }) => {
            const isToday = d.date === today;
            const color = d.total === 0 ? "bg-gray-100" : d.pct === 100 ? "bg-green-500" : d.pct >= 80 ? "bg-yellow-400" : "bg-red-500";
            return (
              <div
                key={d.date}
                className={`text-center rounded-lg p-2 transition-colors ${isToday ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
              >
                <div className="text-[10px] font-medium text-gray-500">{SHORT_DAYS[new Date(d.date + "T00:00:00").getDay()]}</div>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full mx-auto my-1 flex items-center justify-center text-xs sm:text-sm font-bold text-white ${color}`}>
                  {d.total === 0 ? "-" : `${d.pct}%`}
                </div>
                <div className="text-[10px] text-gray-400">
                  {d.total === 0 ? "No shifts" : `${d.open} open`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Link href="/schedule" className="bg-white rounded-xl shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Calendar size={14} /> This Week
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalShifts}</div>
          <div className="text-xs text-gray-400">total shifts</div>
        </Link>

        <Link href="/schedule" className="bg-white rounded-xl shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <AlertTriangle size={14} className="text-red-500" /> Uncovered
          </div>
          <div className={`text-2xl font-bold ${errorWarnings.length > 0 ? "text-red-600" : "text-green-600"}`}>
            {errorWarnings.length}
          </div>
          <div className="text-xs text-gray-400">need attention</div>
        </Link>

        <Link href="/callouts" className="bg-white rounded-xl shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <PhoneOff size={14} className="text-orange-500" /> Callouts
          </div>
          <div className={`text-2xl font-bold ${unresolvedCallouts.length > 0 ? "text-orange-600" : "text-green-600"}`}>
            {unresolvedCallouts.length}
          </div>
          <div className="text-xs text-gray-400">unresolved</div>
        </Link>

        <Link href="/schedule" className="bg-white rounded-xl shadow-sm border p-4 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Users size={14} className="text-blue-500" /> 2:1 Status
          </div>
          <div className={`text-2xl font-bold ${needs2to1.length > 0 ? "text-amber-600" : "text-green-600"}`}>
            {full2to1.length}/{full2to1.length + needs2to1.length}
          </div>
          <div className="text-xs text-gray-400">fully staffed</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Active callouts */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <PhoneOff size={14} /> Active Callouts
            </h2>
            <Link href="/callouts" className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="p-3">
            {unresolvedCallouts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active callouts</p>
            ) : (
              <div className="space-y-2">
                {unresolvedCallouts.slice(0, 5).map((c: Record<string, unknown>) => (
                  <div key={c.id as number} className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{c.student_name as string}</span>
                      <span className="text-gray-500 ml-2 text-xs">{c.date as string} {formatTime(c.start_time as string)}</span>
                    </div>
                    <Badge variant="error">Needs coverage</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Today's available staff */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <UserCheck size={14} /> Available Staff Today
            </h2>
            <span className="text-xs text-gray-400">{todayUnassignedStaff.length} unassigned</span>
          </div>
          <div className="p-3">
            {todayUnassignedStaff.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                {todayShifts.length === 0 ? "No shifts today" : "All staff are assigned"}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {todayUnassignedStaff.map(s => (
                  <span key={s.id} className="px-2.5 py-1.5 text-xs bg-green-50 border border-green-200 rounded-lg text-green-700 font-medium">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Staff workload */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users size={14} /> Staff Workload
            </h2>
          </div>
          <div className="p-3">
            {staffLoad.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No assignments yet</p>
            ) : (
              <div className="space-y-1.5">
                {staffLoad.slice(0, 8).map((s, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm py-0.5">
                    <span className="w-24 truncate text-gray-700">{s.staff_name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`rounded-full h-2.5 transition-all ${
                          s.total_shifts > 8 ? "bg-red-500" : s.total_shifts > 5 ? "bg-yellow-400" : "bg-blue-500"
                        }`}
                        style={{ width: `${(s.total_shifts / maxLoad) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-4 text-right">{s.total_shifts}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Warnings summary */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={14} /> Warnings
            </h2>
            {warnings.length > 0 && (
              <Link href="/reports" className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1">
                Full report <ArrowRight size={12} />
              </Link>
            )}
          </div>
          <div className="p-3">
            {warnings.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle size={24} className="text-green-500 mx-auto mb-1" />
                <p className="text-sm text-gray-500">Schedule looks clean!</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {warnings.slice(0, 6).map((w: { severity: string; message: string; type: string }, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1">
                    <Badge variant={w.severity === "error" ? "error" : "warning"} className="shrink-0 mt-0.5">{w.severity}</Badge>
                    <span className="text-gray-600">{w.message}</span>
                  </div>
                ))}
                {warnings.length > 6 && (
                  <Link href="/reports" className="block text-xs text-blue-600 hover:text-blue-800 pt-1">
                    + {warnings.length - 6} more warnings
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
