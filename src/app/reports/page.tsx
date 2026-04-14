"use client";
import { useState } from "react";
import { useReports } from "@/lib/hooks";
import { getWeekBounds } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Users, Droplets, BarChart3, AlertTriangle, Flame, Download } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";

export default function ReportsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
  const { weekStart, weekEnd } = getWeekBounds(today.toISOString().split("T")[0]);

  const { data: report, error: reportError, mutate } = useReports(weekStart, weekEnd);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports & Fairness</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.open(`/api/reports/burnout-pdf?weekStart=${weekStart}&weekEnd=${weekEnd}`, "_blank")}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 text-gray-600"
          >
            <Download size={14} /> Burnout PDF
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
              {weekStart} to {weekEnd}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {reportError ? (
        <ErrorBanner message="Failed to load report." onRetry={() => mutate()} />
      ) : !report ? (
        <div className="text-center py-12 text-gray-500">Loading report...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Summary cards */}
          <div className="lg:col-span-2 grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="text-sm text-gray-600">Total Staff Assignments</div>
              <div className="text-2xl font-bold text-gray-900">
                {(report.staffLoadCounts as Array<{ total_shifts: number }>)?.reduce((a: number, b: { total_shifts: number }) => a + b.total_shifts, 0) || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="text-sm text-gray-600">Uncovered Shifts</div>
              <div className="text-2xl font-bold text-red-600">
                {(report.uncoveredShifts as unknown[])?.length || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="text-sm text-gray-600">Callouts</div>
              <div className="text-2xl font-bold text-orange-600">{report.calloutCount}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="text-sm text-gray-600">Overrides</div>
              <div className="text-2xl font-bold text-yellow-600">{report.overrideCount}</div>
            </div>
          </div>

          {/* Staff load */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={18} /> Staff Workload
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-gray-600">Staff</th>
                  <th className="text-right py-2 text-gray-600">Total</th>
                  <th className="text-right py-2 text-gray-600">Overnight</th>
                </tr>
              </thead>
              <tbody>
                {(report.staffLoadCounts as Array<{ staff_name: string; total_shifts: number; overnight_count: number }>)?.map((s: { staff_name: string; total_shifts: number; overnight_count: number }, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.staff_name}</td>
                    <td className="py-2 text-right">
                      <Badge variant={s.total_shifts > 6 ? "warning" : "default"}>{s.total_shifts}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      {s.overnight_count > 0 ? <Badge variant="info">{s.overnight_count}</Badge> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Swim assignments */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Droplets size={18} /> Swim Assignment Balance
            </h2>
            {(report.swimCounts as unknown[])?.length === 0 ? (
              <p className="text-sm text-gray-500">No swim assignments this week</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-gray-600">Staff</th>
                    <th className="text-right py-2 text-gray-600">Swim Shifts</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.swimCounts as Array<{ staff_name: string; swim_count: number }>)?.map((s: { staff_name: string; swim_count: number }, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{s.staff_name}</td>
                      <td className="py-2 text-right">
                        <Badge variant={s.swim_count > 2 ? "warning" : "info"}>{s.swim_count}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Staff-student pairings */}
          <div className="bg-white rounded-lg shadow-sm border p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users size={18} /> Staff-Student Pairings
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-gray-600">Staff</th>
                  <th className="text-left py-2 text-gray-600">Student</th>
                  <th className="text-right py-2 text-gray-600">Times This Week</th>
                  <th className="text-right py-2 text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {(report.pairingCounts as Array<{ staff_name: string; student_name: string; count: number }>)?.map((p: { staff_name: string; student_name: string; count: number }, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{p.staff_name}</td>
                    <td className="py-2">{p.student_name}</td>
                    <td className="py-2 text-right">{p.count}</td>
                    <td className="py-2 text-right">
                      {p.count > 2 ? (
                        <Badge variant="warning"><AlertTriangle size={10} className="mr-1" />Over limit</Badge>
                      ) : p.count === 2 ? (
                        <Badge variant="info">At limit</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Burnout risk */}
          {(report.burnoutRisks as Array<{
            staffName: string; totalShifts: number; totalHours: number;
            daysWorked: number; maxConsecutiveDays: number; overnightCount: number;
            maxSameStudent: number; topStudentName: string; topStudentCount: number;
            riskScore: number; riskLevel: string;
          }>)?.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Flame size={18} className="text-orange-500" /> Burnout Risk Tracker
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-gray-600">Staff</th>
                      <th className="text-right py-2 text-gray-600">Shifts</th>
                      <th className="text-right py-2 text-gray-600">Hours</th>
                      <th className="text-right py-2 text-gray-600">Days</th>
                      <th className="text-right py-2 text-gray-600">Consec.</th>
                      <th className="text-right py-2 text-gray-600">Overnight</th>
                      <th className="text-left py-2 text-gray-600 pl-4">Top Student</th>
                      <th className="text-right py-2 text-gray-600">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.burnoutRisks as Array<{
                      staffName: string; totalShifts: number; totalHours: number;
                      daysWorked: number; maxConsecutiveDays: number; overnightCount: number;
                      topStudentName: string; topStudentCount: number;
                      riskScore: number; riskLevel: string;
                    }>)?.map((b, i: number) => (
                      <tr key={i} className={`border-b last:border-0 ${b.riskLevel === "high" ? "bg-red-50" : b.riskLevel === "moderate" ? "bg-amber-50/50" : ""}`}>
                        <td className="py-2 font-medium">{b.staffName}</td>
                        <td className="py-2 text-right">{b.totalShifts}</td>
                        <td className="py-2 text-right">{b.totalHours}h</td>
                        <td className="py-2 text-right">{b.daysWorked}</td>
                        <td className="py-2 text-right">
                          <Badge variant={b.maxConsecutiveDays >= 5 ? "error" : b.maxConsecutiveDays >= 4 ? "warning" : "default"}>
                            {b.maxConsecutiveDays}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">
                          {b.overnightCount > 0 ? <Badge variant={b.overnightCount >= 3 ? "warning" : "info"}>{b.overnightCount}</Badge> : "—"}
                        </td>
                        <td className="py-2 pl-4 text-gray-600">
                          {b.topStudentName ? `${b.topStudentName} (${b.topStudentCount}x)` : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant={b.riskLevel === "high" ? "error" : b.riskLevel === "moderate" ? "warning" : "success"}>
                            {b.riskLevel}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-[11px] text-gray-400 space-y-0.5">
                <p>Risk factors: high hours (&gt;42/50h), consecutive days (&ge;5/6/7 — 5-day weeks are normal), same-student repetition (&ge;3/4), overnight frequency (&ge;2/3), high shift count (&gt;7/10)</p>
              </div>
            </div>
          )}

          {/* Uncovered shifts */}
          {(report.uncoveredShifts as unknown[])?.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-700">
                <AlertTriangle size={18} /> Uncovered Shifts
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-gray-600">Date</th>
                    <th className="text-left py-2 text-gray-600">Time</th>
                    <th className="text-left py-2 text-gray-600">Student</th>
                    <th className="text-left py-2 text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.uncoveredShifts as Array<{ date: string; start_time: string; end_time: string; student_name: string; status: string }>)?.map((s, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{s.date}</td>
                      <td className="py-2">{s.start_time} - {s.end_time}</td>
                      <td className="py-2 font-medium">{s.student_name}</td>
                      <td className="py-2"><Badge variant="error">{s.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
