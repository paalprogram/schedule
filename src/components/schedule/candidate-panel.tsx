"use client";
import { useState, useEffect } from "react";
import { useShiftCandidates } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Check, AlertTriangle, X, Save } from "lucide-react";
import { formatTime } from "@/lib/utils";
import type { CandidateScore } from "@/types";

interface CandidatePanelProps {
  shiftId: number | null;
  onClose: () => void;
  onAssign: () => void;
}

export function CandidatePanel({ shiftId, onClose, onAssign }: CandidatePanelProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: candidates, error: candidatesError, mutate: mutateCandidates } = useShiftCandidates(shiftId);
  const [shift, setShift] = useState<Record<string, unknown> | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [shiftOverride, setShiftOverride] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [assigning, setAssigning] = useState<number | null>(null);

  useEffect(() => {
    if (shiftId) {
      fetch(`/api/shifts/${shiftId}`).then(r => r.json()).then(s => {
        setShift(s);
        setShiftNotes(s.notes || "");
        setShiftOverride(s.override_note || "");
      });
    } else {
      setShift(null);
      setShiftNotes("");
      setShiftOverride("");
    }
  }, [shiftId]);

  async function handleAssign(staffId: number, candidate: CandidateScore) {
    const cascadeWarnings = candidate.warnings.filter(w => w.startsWith("Assigning will uncover"));
    const isUntrained = candidate.warnings.some(w => w.includes("Not trained"));

    if (cascadeWarnings.length > 0) {
      const msg = cascadeWarnings.join("\n") + "\n\nThis will leave another student uncovered. Continue?";
      if (!await confirm({ title: "Cascade Warning", message: msg, confirmText: "Assign Anyway", variant: "danger" })) return;
    } else if (isUntrained) {
      if (!await confirm({ title: "Untrained Staff", message: "This staff member is not trained on this student. Proceed with override?", confirmText: "Assign with Override", variant: "danger" })) return;
    }

    setAssigning(staffId);
    const body: Record<string, unknown> = { assigned_staff_id: staffId, status: "scheduled" };
    if (candidate.warnings.length > 0 && overrideNote) {
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

  async function handleSaveNotes() {
    setSavingNotes(true);
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigned_staff_id: shift?.assigned_staff_id,
        notes: shiftNotes || null,
        override_note: shiftOverride || null,
      }),
    });
    setSavingNotes(false);
    toast("Notes saved");
    onAssign();
  }

  if (!shiftId) return null;

  return (
    <Modal open={!!shiftId} onClose={onClose} title="Assign Staff" wide>
      {shift && (
        <div className="mb-4 space-y-3">
          {/* Shift info */}
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <div className="font-semibold text-gray-900">{shift.student_name as string}</div>
            <div className="text-gray-500 text-xs mt-0.5">
              {shift.date as string} &middot; {formatTime(shift.start_time as string)}-{formatTime(shift.end_time as string)}
              {shift.activity_type !== "general" && <span className="ml-1 text-gray-400">&middot; {shift.activity_type as string}</span>}
              {shift.shift_type === "overnight" && <span className="ml-1 text-indigo-500">&middot; Overnight</span>}
            </div>
            {!!(shift.assigned_staff_id) && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span>Assigned: <strong>{shift.staff_name as string}</strong></span>
                <button onClick={handleUnassign} className="text-red-500 hover:text-red-700 flex items-center gap-0.5 font-medium">
                  <X size={12} /> Unassign
                </button>
              </div>
            )}
          </div>

          {/* Notes section — collapsible feel */}
          <details className="group">
            <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700">
              Shift Notes {(shiftNotes || shiftOverride) ? "(has notes)" : ""}
            </summary>
            <div className="mt-2 space-y-2 pl-1">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Notes</label>
                <input value={shiftNotes} onChange={e => setShiftNotes(e.target.value)} className="w-full border rounded px-2 py-1 text-xs" placeholder="See Kaitlin/Swim, In @10:30..." />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Override reason</label>
                <input value={shiftOverride} onChange={e => setShiftOverride(e.target.value)} className="w-full border rounded px-2 py-1 text-xs" placeholder="Why this assignment was overridden..." />
              </div>
              <button onClick={handleSaveNotes} disabled={savingNotes} className="flex items-center gap-1 px-2 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-800 disabled:opacity-50">
                <Save size={11} /> {savingNotes ? "Saving..." : "Save"}
              </button>
            </div>
          </details>
        </div>
      )}

      {/* Candidates list */}
      {candidatesError ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-600 mb-2">Failed to load candidates.</p>
          <button onClick={() => mutateCandidates()} className="text-sm text-blue-600 hover:text-blue-800">Retry</button>
        </div>
      ) : !candidates ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading candidates...</div>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {(candidates as CandidateScore[]).map((c) => (
            <div
              key={c.staffId}
              className={`p-2.5 rounded-lg border text-xs ${
                c.excluded
                  ? "bg-gray-50 border-gray-100 opacity-50"
                  : c.warnings.length > 0
                  ? "bg-amber-50/50 border-amber-200"
                  : "bg-white border-gray-200 hover:border-blue-300"
              }`}
            >
              {/* Name + score + assign button */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{c.staffName}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    c.totalScore >= 70 ? "bg-green-100 text-green-700" :
                    c.totalScore >= 40 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {c.totalScore}
                  </span>
                </div>
                {!c.excluded && (
                  <button
                    onClick={() => handleAssign(c.staffId, c)}
                    disabled={assigning === c.staffId}
                    className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Check size={11} /> Assign
                  </button>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-0.5 mb-1">
                {c.tags.map((tag, i) => {
                  const variant = tag.includes("trained") && !tag.includes("not")
                    ? "success"
                    : tag.includes("not") || tag.includes("conflict") || tag.includes("PTO") || tag.includes("cascade") || tag.includes("elsewhere")
                    ? "error"
                    : tag.includes("heavy") || tag.includes("avoid") || /\dx/.test(tag)
                    ? "warning"
                    : "info";
                  return <Badge key={i} variant={variant} className="text-[9px] px-1 py-0">{tag}</Badge>;
                })}
              </div>

              {/* Exclusion reason */}
              {c.excluded && c.excludeReason && (
                <div className="text-[10px] text-red-500 flex items-center gap-0.5">
                  <X size={10} /> {c.excludeReason}
                </div>
              )}

              {/* Warnings */}
              {c.warnings.length > 0 && !c.excluded && (
                <div className="space-y-0.5">
                  {c.warnings.map((w, i) => (
                    <div key={i} className={`text-[10px] flex items-center gap-0.5 ${w.startsWith("Assigning will") ? "text-red-600 font-medium" : "text-amber-600"}`}>
                      <AlertTriangle size={9} /> {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Override note for imperfect assignments */}
      {candidates && (candidates as CandidateScore[]).some(c => c.warnings.length > 0 && !c.excluded) && (
        <div className="mt-3 pt-3 border-t">
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Override note (for imperfect assignments)</label>
          <input value={overrideNote} onChange={e => setOverrideNote(e.target.value)} className="w-full border rounded px-2 py-1 text-xs" placeholder="Reason for override..." />
        </div>
      )}
    </Modal>
  );
}
