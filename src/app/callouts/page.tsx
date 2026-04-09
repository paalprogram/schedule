"use client";
import { useState, useEffect } from "react";
import { getWeekBounds, formatTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CandidatePanel } from "@/components/schedule/candidate-panel";
import { ChevronLeft, ChevronRight, AlertTriangle, Check } from "lucide-react";

interface CalloutRecord {
  id: number;
  shift_id: number;
  original_staff_id: number;
  replacement_staff_id: number | null;
  called_out_at: string;
  reason: string | null;
  resolved: number;
  date: string;
  start_time: string;
  end_time: string;
  student_id: number;
  student_name: string;
  original_staff_name: string;
  replacement_staff_name: string | null;
}

export default function CalloutsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
  const { weekStart, weekEnd } = getWeekBounds(today.toISOString().split("T")[0]);

  const [callouts, setCallouts] = useState<CalloutRecord[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);

  function loadCallouts() {
    fetch(`/api/callouts?weekStart=${weekStart}&weekEnd=${weekEnd}`)
      .then(r => r.json())
      .then(setCallouts);
  }

  useEffect(() => { loadCallouts(); }, [weekStart, weekEnd]);

  function handleAssigned() {
    loadCallouts();
  }

  const unresolved = callouts.filter(c => !c.resolved);
  const resolved = callouts.filter(c => c.resolved);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Callout Management</h1>
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

      {/* Unresolved callouts */}
      {unresolved.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2 mb-3">
            <AlertTriangle size={18} />
            Needs Coverage ({unresolved.length})
          </h2>
          <div className="space-y-3">
            {unresolved.map(c => (
              <div key={c.id} className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{c.student_name}</div>
                    <div className="text-sm text-gray-600">
                      {c.date} | {formatTime(c.start_time)} - {formatTime(c.end_time)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      <span className="text-red-600 font-medium">{c.original_staff_name}</span> called out
                      {c.reason && <span className="text-gray-500"> — {c.reason}</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Reported: {new Date(c.called_out_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedShiftId(c.shift_id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    Find Replacement
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-green-700 flex items-center gap-2 mb-3">
            <Check size={18} />
            Resolved ({resolved.length})
          </h2>
          <div className="space-y-2">
            {resolved.map(c => (
              <div key={c.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-medium">{c.student_name}</span>
                    {" "} {c.date} | {formatTime(c.start_time)} - {formatTime(c.end_time)}
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="line-through text-red-400">{c.original_staff_name}</span>
                    {" → "}
                    <span className="text-green-700 font-medium">{c.replacement_staff_name || "Reassigned"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {callouts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No callouts for this week.
        </div>
      )}

      <CandidatePanel
        shiftId={selectedShiftId}
        onClose={() => setSelectedShiftId(null)}
        onAssign={handleAssigned}
      />
    </div>
  );
}
