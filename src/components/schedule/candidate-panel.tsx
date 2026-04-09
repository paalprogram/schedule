"use client";
import { useState, useEffect } from "react";
import { useShiftCandidates } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Check, AlertTriangle, X } from "lucide-react";
import type { CandidateScore } from "@/types";

interface CandidatePanelProps {
  shiftId: number | null;
  onClose: () => void;
  onAssign: () => void;
}

export function CandidatePanel({ shiftId, onClose, onAssign }: CandidatePanelProps) {
  const { toast } = useToast();
  const { data: candidates, error: candidatesError, mutate: mutateCandidates } = useShiftCandidates(shiftId);
  const [shift, setShift] = useState<Record<string, unknown> | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [assigning, setAssigning] = useState<number | null>(null);

  useEffect(() => {
    if (shiftId) {
      fetch(`/api/shifts/${shiftId}`).then(r => r.json()).then(setShift);
    } else {
      setShift(null);
    }
  }, [shiftId]);

  async function handleAssign(staffId: number, hasWarnings: boolean) {
    setAssigning(staffId);
    const body: Record<string, unknown> = {
      assigned_staff_id: staffId,
      status: "scheduled",
    };
    if (hasWarnings && overrideNote) {
      body.override_note = overrideNote;
    }

    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setAssigning(null);
    setOverrideNote("");
    toast("Staff assigned to shift");
    onAssign();
    onClose();
  }

  async function handleUnassign() {
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_staff_id: null, status: "open" }),
    });
    toast("Staff unassigned from shift", "warning");
    onAssign();
    onClose();
  }

  if (!shiftId) return null;

  return (
    <Modal open={!!shiftId} onClose={onClose} title="Assign Staff" wide>
      {shift && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
          <div className="font-medium">{shift.student_name as string}</div>
          <div className="text-gray-600">
            {shift.date as string} | {shift.start_time as string} - {shift.end_time as string}
            {shift.activity_type !== "general" && ` | ${shift.activity_type}`}
            {shift.shift_type === "overnight" && " | Overnight"}
          </div>
          {shift.assigned_staff_id ? (
            <div className="mt-2 flex items-center justify-between">
              <span>Currently assigned: <strong>{shift.staff_name as string}</strong></span>
              <button onClick={handleUnassign} className="text-red-600 hover:text-red-800 text-xs flex items-center gap-1">
                <X size={12} /> Unassign
              </button>
            </div>
          ) : null}
        </div>
      )}

      {candidatesError ? (
        <div className="text-center py-4">
          <p className="text-sm text-red-600 mb-2">Failed to load candidates.</p>
          <button onClick={() => mutateCandidates()} className="text-sm text-blue-600 hover:text-blue-800">Retry</button>
        </div>
      ) : !candidates ? (
        <div className="text-center py-4 text-gray-500">Loading candidates...</div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {(candidates as CandidateScore[]).map((c) => (
            <div
              key={c.staffId}
              className={`p-3 rounded-lg border text-sm ${
                c.excluded
                  ? "bg-gray-50 border-gray-200 opacity-60"
                  : c.warnings.length > 0
                  ? "bg-yellow-50 border-yellow-200"
                  : "bg-white border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.staffName}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    c.totalScore >= 70 ? "bg-green-100 text-green-700" :
                    c.totalScore >= 40 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {c.totalScore}
                  </span>
                </div>
                {!c.excluded && (
                  <button
                    onClick={() => handleAssign(c.staffId, c.warnings.length > 0)}
                    disabled={assigning === c.staffId}
                    className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Check size={12} /> Assign
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1 mb-1">
                {c.tags.map((tag, i) => {
                  const variant = tag.includes("trained") && !tag.includes("not")
                    ? "success"
                    : tag.includes("not") || tag.includes("conflict") || tag.includes("PTO")
                    ? "error"
                    : tag.includes("heavy") || tag.includes("2x") || tag.includes("3x")
                    ? "warning"
                    : "info";
                  return <Badge key={i} variant={variant}>{tag}</Badge>;
                })}
              </div>

              {c.excluded && (
                <div className="text-xs text-red-600 flex items-center gap-1">
                  <X size={12} /> {c.excludeReason}
                </div>
              )}

              {c.warnings.length > 0 && !c.excluded && (
                <div className="space-y-0.5 mt-1">
                  {c.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-yellow-700 flex items-center gap-1">
                      <AlertTriangle size={10} /> {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {candidates && (candidates as CandidateScore[]).some(c => c.warnings.length > 0 && !c.excluded) && (
        <div className="mt-3 pt-3 border-t">
          <label className="block text-xs font-medium text-gray-700 mb-1">Override note (for imperfect assignments)</label>
          <input
            value={overrideNote}
            onChange={e => setOverrideNote(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="Reason for override..."
          />
        </div>
      )}
    </Modal>
  );
}
