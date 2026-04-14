"use client";
import { useState, useCallback, useMemo } from "react";
import { useSchedule, useStudents, useStaff, useAbsences } from "@/lib/hooks";
import { getWeekBounds } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  ChevronLeft, ChevronRight, Wand2, Download, Printer, Plus,
  AlertTriangle, UserX, FileText, UserMinus, Calendar, UserCog, Users, Trash2,
} from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { ShiftCard } from "@/components/schedule/shift-card";
import { CandidatePanel } from "@/components/schedule/candidate-panel";
import { AddShiftForm } from "@/components/schedule/add-shift-form";
import { BulkAddShiftForm } from "@/components/schedule/bulk-add-shift-form";
import { BulkDeleteForm } from "@/components/schedule/bulk-delete-form";
import { StaffOutForm } from "@/components/schedule/staff-out-form";

export default function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
  const { weekStart, weekEnd } = getWeekBounds(today.toISOString().split("T")[0]);

  const { data: schedule, error: scheduleError, mutate } = useSchedule(weekStart, weekEnd);
  const { data: allStudents } = useStudents();
  const { data: allStaff } = useStaff();
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [showAddShift, setShowAddShift] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [draggingShiftId, setDraggingShiftId] = useState<number | null>(null);
  const [dropHighlight, setDropHighlight] = useState<number | "unassign" | null>(null);
  const [showAbsencePanel, setShowAbsencePanel] = useState(false);
  const [showStaffOut, setShowStaffOut] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [autoAssigningDay, setAutoAssigningDay] = useState<string | null>(null);
  const { mutate: mutateAbsences } = useAbsences(weekStart, weekEnd);
  const { toast } = useToast();

  const refresh = useCallback(() => mutate(), [mutate]);

  async function handleDrop(staffId: number | null, shiftId: number) {
    // Check if this shift already has a primary staff and needs a second (2:1)
    const shiftData = schedule?.days?.flatMap((d: { shifts: Array<Record<string, unknown>> }) => d.shifts).find((s: Record<string, unknown>) => s.id === shiftId);
    const isAssigningSecond = shiftData && shiftData.assigned_staff_id && !shiftData.second_staff_id && ((shiftData.staffing_ratio as number) || 1) >= 2 && staffId;

    const body: Record<string, unknown> = isAssigningSecond
      ? { second_staff_id: staffId }
      : { assigned_staff_id: staffId, status: staffId ? "scheduled" : "open" };

    // If unassigning, clear both staff
    if (!staffId) {
      body.second_staff_id = null;
    }

    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setDraggingShiftId(null);
    setDropHighlight(null);
    refresh();
    if (staffId) {
      const name = allStaff?.find((s: Record<string, unknown>) => s.id === staffId)?.name;
      toast(isAssigningSecond ? `2nd staff assigned: ${name || "staff"}` : `Shift reassigned to ${name || "staff"}`);
    } else {
      toast("Staff unassigned from shift", "warning");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart }),
    });
    refresh();
    setGenerating(false);
    toast("Shifts generated from templates");
  }

  async function handleAutoAssign() {
    setAutoAssigning(true);
    const res = await fetch("/api/schedule/auto-assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart, weekEnd }),
    });
    const result = await res.json();
    refresh();
    setAutoAssigning(false);
    if (result.failed > 0) {
      toast(`Assigned ${result.assigned} shifts, ${result.failed} could not be filled`, "warning");
    } else {
      toast(`All ${result.assigned} open shifts assigned`);
    }
  }

  async function handleAutoAssignDay(date: string) {
    setAutoAssigningDay(date);
    const res = await fetch("/api/schedule/auto-assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: date, weekEnd: date }),
    });
    const result = await res.json();
    refresh();
    setAutoAssigningDay(null);
    if (result.total === 0) {
      toast("No open shifts on this day");
    } else if (result.failed > 0) {
      toast(`${result.assigned} assigned, ${result.failed} could not be filled`, "warning");
    } else {
      toast(`All ${result.assigned} open shift(s) assigned`);
    }
  }

  async function handleToggleAbsence(studentId: number, date: string, isCurrentlyAbsent: boolean) {
    if (isCurrentlyAbsent) {
      await fetch(`/api/absences?student_id=${studentId}&date=${date}`, { method: "DELETE" });
      toast("Absence removed");
    } else {
      await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, date }),
      });
      toast("Student marked as OUT", "warning");
    }
    mutateAbsences();
    refresh();
  }

  const filteredDays = useMemo(() => {
    if (!schedule?.days) return [];
    if (!studentFilter && !staffFilter) return schedule.days;
    return schedule.days.map((day: { date: string; dayName: string; shifts: Array<Record<string, unknown>> }) => ({
      ...day,
      shifts: day.shifts.filter((s: Record<string, unknown>) => {
        if (studentFilter && String(s.student_id) !== studentFilter) return false;
        if (staffFilter && String(s.assigned_staff_id || "") !== staffFilter) return false;
        return true;
      }),
    }));
  }, [schedule, studentFilter, staffFilter]);

  const warningCount = schedule?.warnings?.length || 0;
  const errorCount = schedule?.warnings?.filter((w: { severity: string }) => w.severity === "error").length || 0;

  return (
    <div>
      {/* ── Header: Title + week nav + exports ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Schedule</h1>
          <div className="flex items-center gap-1 bg-white border rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs sm:text-sm font-medium text-gray-700 min-w-0 text-center">
              {weekStart} &mdash; {weekEnd}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setWeekOffset(0)} className="text-xs text-blue-600 hover:text-blue-800 px-1">Today</button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => window.open(`/api/export/pdf?weekStart=${weekStart}&weekEnd=${weekEnd}`, "_blank")} className="p-2 border rounded-lg hover:bg-gray-50" title="PDF">
            <FileText size={15} className="text-gray-500" />
          </button>
          <button onClick={() => window.open(`/api/export?weekStart=${weekStart}&weekEnd=${weekEnd}`, "_blank")} className="p-2 border rounded-lg hover:bg-gray-50" title="CSV">
            <Download size={15} className="text-gray-500" />
          </button>
          <button onClick={() => window.print()} className="hidden sm:block p-2 border rounded-lg hover:bg-gray-50 print:hidden" title="Print">
            <Printer size={15} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* ── Toolbar: filters, actions, bulk ── */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {/* Filters */}
        <select value={studentFilter} onChange={e => setStudentFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
          <option value="">All Students</option>
          {allStudents?.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
            <option key={s.id as number} value={String(s.id)}>{s.name as string}</option>
          ))}
        </select>
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs sm:text-sm bg-white">
          <option value="">All Staff</option>
          {allStaff?.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
            <option key={s.id as number} value={String(s.id)}>{s.name as string}</option>
          ))}
        </select>
        {(studentFilter || staffFilter) && (
          <button onClick={() => { setStudentFilter(""); setStaffFilter(""); }} className="text-xs text-blue-600">Clear</button>
        )}

        {/* Divider */}
        <div className="hidden sm:block w-px h-6 bg-gray-200" />

        {/* Schedule actions */}
        <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs sm:text-sm hover:bg-green-700 disabled:opacity-50">
          <Plus size={14} /> {generating ? "..." : "Generate"}
        </button>
        <button onClick={handleAutoAssign} disabled={autoAssigning} className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 text-white rounded-lg text-xs sm:text-sm hover:bg-purple-700 disabled:opacity-50">
          <Wand2 size={14} /> {autoAssigning ? "..." : "Auto-Assign"}
        </button>

        {/* Divider */}
        <div className="hidden sm:block w-px h-6 bg-gray-200" />

        {/* Bulk actions */}
        <button onClick={() => setShowBulkAdd(weekStart)} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-700">
          <Users size={14} /> Bulk Add
        </button>
        <button onClick={() => setShowBulkDelete(true)} className="flex items-center gap-1 px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs sm:text-sm hover:bg-red-50 hover:border-red-300">
          <Trash2 size={14} /> Bulk Delete
        </button>

        {/* Divider */}
        <div className="hidden sm:block w-px h-6 bg-gray-200" />

        {/* Staff actions */}
        <button onClick={() => setShowAbsencePanel(p => !p)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm ${showAbsencePanel ? "bg-orange-600 text-white" : "border hover:bg-gray-50"}`}>
          <UserMinus size={14} /> {showAbsencePanel ? "Done" : "Absences"}
        </button>
        <button onClick={() => setShowStaffOut(true)} className="flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs sm:text-sm hover:bg-gray-50 text-red-600 border-red-200 hover:border-red-300">
          <UserCog size={14} /> Staff OUT
        </button>
      </div>

      {/* ── Warnings ── */}
      {warningCount > 0 && (
        <div className={`mb-4 rounded-lg p-2.5 sm:p-3 border ${errorCount > 0 ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className={errorCount > 0 ? "text-red-500" : "text-yellow-500"} />
            <span className="text-xs sm:text-sm font-medium">
              {warningCount} warning{warningCount !== 1 ? "s" : ""}
              {errorCount > 0 ? ` (${errorCount} critical)` : ""}
            </span>
          </div>
          <div className="space-y-0.5">
            {schedule?.warnings?.slice(0, 3).map((w: { severity: string; message: string }, i: number) => (
              <div key={i} className="text-xs flex items-start gap-1.5">
                <Badge variant={w.severity === "error" ? "error" : "warning"} className="shrink-0">{w.severity}</Badge>
                <span className="text-gray-600">{w.message}</span>
              </div>
            ))}
            {warningCount > 3 && <div className="text-xs text-gray-400 mt-1">+ {warningCount - 3} more</div>}
          </div>
        </div>
      )}

      {/* ── Loading / Error ── */}
      {scheduleError && <ErrorBanner message="Failed to load schedule." onRetry={() => mutate()} />}
      {!schedule && !scheduleError && <div className="text-center py-16 text-gray-400">Loading schedule...</div>}

      {/* ── Schedule grid ── */}
      {schedule && (
        <div className="overflow-x-auto -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2 min-w-0 print:grid-cols-7 print:gap-1">
            {filteredDays.map((day: { date: string; dayName: string; shifts: Array<Record<string, unknown>> }) => (
              <div key={day.date} className="bg-white rounded-lg shadow-sm border min-w-0">
                {/* Day header */}
                <div className="px-2 py-1.5 border-b bg-gray-50 rounded-t-lg flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900">{day.dayName}</div>
                    <div className="text-[10px] text-gray-400">{day.date}</div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => handleAutoAssignDay(day.date)}
                      disabled={autoAssigningDay === day.date}
                      className={`p-1 rounded ${autoAssigningDay === day.date ? "text-purple-400 animate-pulse" : "text-purple-400 hover:text-purple-600"}`}
                      title="Auto-assign open shifts for this day"
                    >
                      <Wand2 size={13} />
                    </button>
                    <button onClick={() => setShowAddShift(day.date)} className="text-blue-500 hover:text-blue-700 p-1" title="Add shift">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Absence toggles */}
                {showAbsencePanel && allStudents && (
                  <div className="px-1.5 py-1.5 border-b bg-orange-50/60">
                    <div className="flex flex-wrap gap-0.5">
                      {allStudents.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => {
                        const absentIds: number[] = schedule?.absences?.[day.date] || [];
                        const isOut = absentIds.includes(s.id as number);
                        return (
                          <button
                            key={s.id as number}
                            onClick={() => handleToggleAbsence(s.id as number, day.date, isOut)}
                            className={`px-1 py-0.5 rounded text-[10px] font-medium transition-colors ${isOut ? "bg-gray-500 text-white" : "bg-white border border-gray-200 text-gray-500"}`}
                          >
                            {isOut && "X "}{s.name as string}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Meetings */}
                {schedule?.meetings?.[day.date]?.length > 0 && (
                  <div className="px-1.5 pt-1.5 space-y-1">
                    {schedule.meetings[day.date].map((m: Record<string, unknown>) => (
                      <div key={m.id as number} className="rounded border border-indigo-200 bg-indigo-50/70 px-1.5 py-1 text-[10px]">
                        <div className="flex items-center gap-1 font-semibold text-indigo-700">
                          <Calendar size={9} className="shrink-0" />
                          <span className="truncate">{m.title as string}</span>
                        </div>
                        <div className="text-indigo-500 truncate">
                          {m.startTime as string}-{m.endTime as string}
                          {(m.attendeeNames as string[])?.length > 0 && (
                            <span className="ml-0.5 text-indigo-400">{(m.attendeeNames as string[]).join(", ")}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Shifts */}
                <div className="p-1.5 space-y-1.5 min-h-[80px] sm:min-h-[120px]">
                  {day.shifts.length === 0 ? (
                    <div className="text-[10px] text-gray-300 text-center py-4 sm:py-6">No shifts</div>
                  ) : (
                    day.shifts.map((shift: Record<string, unknown>) => (
                      <ShiftCard
                        key={shift.id as number}
                        shift={shift}
                        warnings={schedule?.warnings?.filter((w: { shiftId?: number }) => w.shiftId === shift.id) || []}
                        onClick={() => setSelectedShiftId(shift.id as number)}
                        onCallout={(shiftId) => { refresh(); setSelectedShiftId(shiftId); }}
                        onDragStart={(id) => setDraggingShiftId(id)}
                        onDragEnd={() => { setDraggingShiftId(null); setDropHighlight(null); }}
                      />
                    ))
                  )}
                </div>

                {/* Unassigned available staff */}
                {(() => {
                  const unassigned: Array<{ id: number; name: string }> = schedule?.unassignedStaff?.[day.date] || [];
                  if (unassigned.length === 0) return null;
                  return (
                    <details className="border-t">
                      <summary className="px-2 py-1.5 text-[10px] font-medium text-green-700 bg-green-50/60 cursor-pointer hover:bg-green-50 select-none">
                        {unassigned.length} staff available
                      </summary>
                      <div className="px-1.5 py-1 bg-green-50/30 flex flex-wrap gap-0.5">
                        {unassigned.map(s => (
                          <span key={s.id} className="px-1.5 py-0.5 text-[10px] bg-white border border-green-200 rounded text-green-700">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </details>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Drag-and-drop staff panel (desktop only) ── */}
      {draggingShiftId && allStaff && (
        <div className="hidden sm:block fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-40 p-3 print:hidden">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-xs font-medium text-gray-400 mb-2">Drop on a staff member to reassign</div>
            <div className="flex flex-wrap gap-1.5">
              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropHighlight("unassign"); }}
                onDragLeave={() => setDropHighlight(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(null, parseInt(e.dataTransfer.getData("text/plain"))); }}
                className={`px-2.5 py-1.5 rounded-lg border-2 border-dashed text-xs flex items-center gap-1 transition-colors ${dropHighlight === "unassign" ? "border-red-400 bg-red-50 text-red-700" : "border-gray-300 text-gray-400"}`}
              >
                <UserX size={13} /> Unassign
              </div>
              {allStaff.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
                <div
                  key={s.id as number}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropHighlight(s.id as number); }}
                  onDragLeave={() => setDropHighlight(null)}
                  onDrop={(e) => { e.preventDefault(); handleDrop(s.id as number, parseInt(e.dataTransfer.getData("text/plain"))); }}
                  className={`px-2.5 py-1.5 rounded-lg border-2 border-dashed text-xs font-medium transition-colors ${dropHighlight === (s.id as number) ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
                >
                  {s.name as string}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <CandidatePanel shiftId={selectedShiftId} onClose={() => setSelectedShiftId(null)} onAssign={refresh} />
      {showAddShift && <AddShiftForm date={showAddShift} onClose={() => setShowAddShift(null)} onCreated={refresh} />}
      {showBulkAdd && <BulkAddShiftForm date={showBulkAdd} onClose={() => setShowBulkAdd(null)} onCreated={refresh} />}
      {showBulkDelete && schedule?.days && <BulkDeleteForm weekStart={weekStart} weekEnd={weekEnd} days={schedule.days} onClose={() => setShowBulkDelete(false)} onDeleted={refresh} />}
      {showStaffOut && <StaffOutForm weekStart={weekStart} weekEnd={weekEnd} onClose={() => setShowStaffOut(false)} onDone={refresh} />}
    </div>
  );
}
