"use client";
import { useState, useCallback } from "react";
import { useSchedule } from "@/lib/hooks";
import { getWeekBounds, formatTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ChevronLeft, ChevronRight, Wand2, Download, Printer, Plus, AlertTriangle } from "lucide-react";
import { ShiftCard } from "@/components/schedule/shift-card";
import { CandidatePanel } from "@/components/schedule/candidate-panel";
import { AddShiftForm } from "@/components/schedule/add-shift-form";

export default function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
  const { weekStart, weekEnd } = getWeekBounds(today.toISOString().split("T")[0]);

  const { data: schedule, mutate } = useSchedule(weekStart, weekEnd);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [showAddShift, setShowAddShift] = useState<string | null>(null); // date string
  const [generating, setGenerating] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);

  const refresh = useCallback(() => mutate(), [mutate]);

  async function handleGenerate() {
    setGenerating(true);
    await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart }),
    });
    refresh();
    setGenerating(false);
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
    alert(`Auto-assign complete: ${result.assigned} assigned, ${result.failed} could not be filled`);
  }

  function handleExportCSV() {
    window.open(`/api/export?weekStart=${weekStart}&weekEnd=${weekEnd}`, "_blank");
  }

  function handlePrint() {
    window.print();
  }

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
      <div className="grid grid-cols-5 gap-3 print:gap-1">
        {schedule?.days?.map((day: { date: string; dayName: string; shifts: Array<Record<string, unknown>> }) => (
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
                    onCallout={refresh}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {!schedule && (
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
