"use client";
import { useState, useCallback, useMemo } from "react";
import { useSchedule, useStudents, useStaff, useAbsences } from "@/lib/hooks";
import { getWeekBounds } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ChevronLeft, ChevronRight, Wand2, Download, Printer, Plus, AlertTriangle, UserX, FileText, UserMinus } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { ShiftCard } from "@/components/schedule/shift-card";
import { CandidatePanel } from "@/components/schedule/candidate-panel";
import { AddShiftForm } from "@/components/schedule/add-shift-form";

export default function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
  const { weekStart, weekEnd } = getWeekBounds(today.toISOString().split("T")[0]);

  const { data: schedule, error: scheduleError, mutate } = useSchedule(weekStart, weekEnd);
  const { data: allStudents } = useStudents();
  const { data: allStaff } = useStaff();
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [showAddShift, setShowAddShift] = useState<string | null>(null); // date string
  const [generating, setGenerating] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [draggingShiftId, setDraggingShiftId] = useState<number | null>(null);
  const [dropHighlight, setDropHighlight] = useState<number | "unassign" | null>(null);
  const [showAbsencePanel, setShowAbsencePanel] = useState(false);
  const { data: absences, mutate: mutateAbsences } = useAbsences(weekStart, weekEnd);
  const { toast } = useToast();

  const refresh = useCallback(() => mutate(), [mutate]);

  async function handleDrop(staffId: number | null, shiftId: number) {
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigned_staff_id: staffId,
        status: staffId ? "scheduled" : "open",
      }),
    });
    setDraggingShiftId(null);
    setDropHighlight(null);
    refresh();
    if (staffId) {
      const name = allStaff?.find((s: Record<string, unknown>) => s.id === staffId)?.name;
      toast(`Shift reassigned to ${name || "staff"}`);
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

  function handleExportCSV() {
    window.open(`/api/export?weekStart=${weekStart}&weekEnd=${weekEnd}`, "_blank");
  }

  function handleExportPDF() {
    window.open(`/api/export/pdf?weekStart=${weekStart}&weekEnd=${weekEnd}`, "_blank");
  }

  function handlePrint() {
    window.print();
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Weekly Schedule</h1>
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
            <button onClick={() => setWeekOffset(0)} className="text-xs text-blue-600 hover:text-blue-800 ml-2">Today</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={studentFilter}
            onChange={e => setStudentFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Students</option>
            {allStudents?.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
              <option key={s.id as number} value={String(s.id)}>{s.name as string}</option>
            ))}
          </select>
          <select
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Staff</option>
            {allStaff?.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
              <option key={s.id as number} value={String(s.id)}>{s.name as string}</option>
            ))}
          </select>
          {(studentFilter || staffFilter) && (
            <button
              onClick={() => { setStudentFilter(""); setStaffFilter(""); }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear filters
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            <Plus size={14} /> {generating ? "Generating..." : "Generate from Templates"}
          </button>
          <button
            onClick={handleAutoAssign}
            disabled={autoAssigning}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            <Wand2 size={14} /> {autoAssigning ? "Assigning..." : "Auto-Assign Open"}
          </button>
          <button
            onClick={() => setShowAbsencePanel(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${
              showAbsencePanel
                ? "bg-orange-600 text-white hover:bg-orange-700"
                : "border hover:bg-gray-50"
            }`}
          >
            <UserMinus size={14} /> {showAbsencePanel ? "Done Marking" : "Mark Absences"}
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
            <FileText size={14} /> PDF
          </button>
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
            <Download size={14} /> CSV
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 print:hidden">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Warnings banner */}
      {warningCount > 0 && (
        <div className={`mb-4 rounded-lg p-3 ${errorCount > 0 ? "bg-red-50 border border-red-200" : "bg-yellow-50 border border-yellow-200"}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className={errorCount > 0 ? "text-red-600" : "text-yellow-600"} />
            <span className="text-sm font-medium">
              {warningCount} warning{warningCount !== 1 ? "s" : ""} detected
              {errorCount > 0 ? ` (${errorCount} critical)` : ""}
            </span>
          </div>
          <div className="space-y-1">
            {schedule?.warnings?.slice(0, 5).map((w: { severity: string; message: string }, i: number) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <Badge variant={w.severity === "error" ? "error" : "warning"}>
                  {w.severity}
                </Badge>
                {w.message}
              </div>
            ))}
            {warningCount > 5 && (
              <div className="text-xs text-gray-500">+ {warningCount - 5} more warnings</div>
            )}
          </div>
        </div>
      )}

      {/* Schedule grid */}
      <div className="grid grid-cols-7 gap-3 print:gap-1">
        {filteredDays.map((day: { date: string; dayName: string; shifts: Array<Record<string, unknown>> }) => (
          <div key={day.date} className="bg-white rounded-lg shadow-sm border">
            <div className="px-3 py-2 border-b bg-gray-50 rounded-t-lg flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">{day.dayName}</div>
                <div className="text-xs text-gray-500">{day.date}</div>
              </div>
              <button
                onClick={() => setShowAddShift(day.date)}
                className="text-blue-600 hover:text-blue-800"
                title="Add shift"
              >
                <Plus size={14} />
              </button>
            </div>
            {showAbsencePanel && allStudents && (
              <div className="px-2 pt-2 pb-1 border-b bg-orange-50">
                <div className="text-xs font-medium text-orange-700 mb-1">Toggle student absences:</div>
                <div className="flex flex-wrap gap-1">
                  {allStudents.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => {
                    const absentIds: number[] = schedule?.absences?.[day.date] || [];
                    const isOut = absentIds.includes(s.id as number);
                    return (
                      <button
                        key={s.id as number}
                        onClick={() => handleToggleAbsence(s.id as number, day.date, isOut)}
                        className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                          isOut
                            ? "bg-gray-400 text-white"
                            : "bg-white border border-gray-300 text-gray-600 hover:border-orange-400"
                        }`}
                        title={isOut ? `Mark ${s.name} present` : `Mark ${s.name} as OUT`}
                      >
                        {isOut ? "OUT" : ""} {s.name as string}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="p-2 space-y-2 min-h-[200px]">
              {day.shifts.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">No shifts</div>
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
          </div>
        ))}
      </div>

      {/* Drag-and-drop staff panel */}
      {draggingShiftId && allStaff && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-40 p-3 print:hidden">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-xs font-medium text-gray-500 mb-2">Drop on a staff member to reassign</div>
            <div className="flex flex-wrap gap-2">
              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropHighlight("unassign"); }}
                onDragLeave={() => setDropHighlight(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(null, parseInt(e.dataTransfer.getData("text/plain"))); }}
                className={`px-3 py-2 rounded-lg border-2 border-dashed text-sm flex items-center gap-1.5 transition-colors ${
                  dropHighlight === "unassign"
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-gray-300 text-gray-500 hover:border-red-300"
                }`}
              >
                <UserX size={14} /> Unassign
              </div>
              {allStaff.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
                <div
                  key={s.id as number}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropHighlight(s.id as number); }}
                  onDragLeave={() => setDropHighlight(null)}
                  onDrop={(e) => { e.preventDefault(); handleDrop(s.id as number, parseInt(e.dataTransfer.getData("text/plain"))); }}
                  className={`px-3 py-2 rounded-lg border-2 border-dashed text-sm font-medium transition-colors ${
                    dropHighlight === (s.id as number)
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-700 hover:border-blue-300"
                  }`}
                >
                  {s.name as string}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {scheduleError && (
        <ErrorBanner message="Failed to load schedule." onRetry={() => mutate()} />
      )}
      {!schedule && !scheduleError && (
        <div className="text-center py-12 text-gray-500">Loading schedule...</div>
      )}

      {/* Candidate panel */}
      <CandidatePanel
        shiftId={selectedShiftId}
        onClose={() => setSelectedShiftId(null)}
        onAssign={refresh}
      />

      {/* Add shift modal */}
      {showAddShift && (
        <AddShiftForm
          date={showAddShift}
          onClose={() => setShowAddShift(null)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
