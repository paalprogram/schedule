"use client";
import { useState, useEffect } from "react";
import { useShiftCandidates } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Check, AlertTriangle, X, Save, Trash2, UserX, Pencil } from "lucide-react";
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
  const [editing, setEditing] = useState(false);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editShiftType, setEditShiftType] = useState("regular");
  const [editActivityType, setEditActivityType] = useState("general");
  const [editSwim, setEditSwim] = useState(false);

  useEffect(() => {
    if (shiftId) {
      fetch(`/api/shifts/${shiftId}`).then(r => r.json()).then(s => {
        setShift(s);
        setShiftNotes(s.notes || "");
        setShiftOverride(s.override_note || "");
        setEditStartTime(s.start_time || "08:00");
        setEditEndTime(s.end_time || "14:00");
        setEditShiftType(s.shift_type || "regular");
        setEditActivityType(s.activity_type || "general");
        setEditSwim(!!s.needs_swim_support);
        setEditing(false);
      });
    } else {
      setShift(null);
      setShiftNotes("");
      setShiftOverride("");
      setEditing(false);
    }
  }, [shiftId]);

  async function handleAssign(staffId: number, candidate: CandidateScore, asSecond?: boolean) {
    const cascadeWarnings = candidate.warnings.filter(w => w.startsWith("Assigning will uncover"));
    const isUntrained = candidate.warnings.some(w => w.includes("Not trained"));

    if (cascadeWarnings.length > 0) {
      const msg = cascadeWarnings.join("\n") + "\n\nThis will leave another student uncovered. Continue?";
      if (!await confirm({ title: "Cascade Warning", message: msg, confirmText: "Assign Anyway", variant: "danger" })) return;
    } else if (isUntrained) {
      if (!await confirm({ title: "Untrained Staff", message: "This staff member is not trained on this student. Proceed with override?", confirmText: "Assign with Override", variant: "danger" })) return;
    }

    setAssigning(staffId);
    const body: Record<string, unknown> = asSecond
      ? { second_staff_id: staffId }
      : { assigned_staff_id: staffId, status: "scheduled" };
    if (candidate.warnings.length > 0 && overrideNote) body.override_note = overrideNote;
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setAssigning(null);
    setOverrideNote("");
    toast(asSecond ? "2nd staff assigned to shift" : "Staff assigned to shift");
    onAssign();
    onClose();
  }

  async function handleUnassign() {
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_staff_id: null, second_staff_id: null, status: "open" }),
    });
    toast("Staff unassigned from shift", "warning");
    onAssign();
    onClose();
  }

  async function handleUnassignSecond() {
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ second_staff_id: null }),
    });
    toast("2nd staff unassigned from shift", "warning");
    onAssign();
    onClose();
  }

  async function handleDelete() {
    if (!await confirm({ title: "Delete Shift", message: `Delete this shift for ${shift?.student_name}? This cannot be undone.`, confirmText: "Delete", variant: "danger" })) return;
    await fetch(`/api/shifts/${shiftId}`, { method: "DELETE" });
    toast("Shift deleted", "warning");
    onAssign();
    onClose();
  }

  async function handleMarkAbsent() {
    if (!shift) return;
    const studentName = shift.student_name as string;
    const date = shift.date as string;
    if (!await confirm({ title: "Mark Student OUT", message: `Mark ${studentName} as OUT on ${date}? This will flag all their shifts for that day.`, confirmText: "Mark OUT" })) return;
    await fetch("/api/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: shift.student_id, date }),
    });
    toast(`${studentName} marked as OUT on ${date}`, "warning");
    onAssign();
    onClose();
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: shiftNotes || null,
        override_note: shiftOverride || null,
      }),
    });
    setSavingNotes(false);
    toast("Notes saved");
    onAssign();
  }

  async function handleSaveEdit() {
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_time: editStartTime,
        end_time: editEndTime,
        shift_type: editShiftType,
        activity_type: editActivityType,
        needs_swim_support: editSwim,
      }),
    });
    toast("Shift updated");
    setEditing(false);
    onAssign();
    // Refresh shift data
    const res = await fetch(`/api/shifts/${shiftId}`);
    const updated = await res.json();
    setShift(updated);
    mutateCandidates();
  }

  if (!shiftId) return null;

  return (
    <Modal open={!!shiftId} onClose={onClose} title="Shift Details" wide>
      {shift && (
        <div className="mb-4 space-y-3">
          {/* Shift info header */}
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900">{shift.student_name as string}</div>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditing(e => !e)} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="Edit shift">
                  <Pencil size={14} />
                </button>
                <button onClick={handleMarkAbsent} className="p-1 text-gray-400 hover:text-orange-600 rounded" title="Mark student OUT">
                  <UserX size={14} />
                </button>
                <button onClick={handleDelete} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Delete shift">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="text-gray-500 text-xs mt-0.5">
              {shift.date as string} &middot; {formatTime(shift.start_time as string)}-{formatTime(shift.end_time as string)}
              {shift.activity_type !== "general" && <span className="ml-1 text-gray-400">&middot; {shift.activity_type as string}</span>}
              {shift.shift_type === "overnight" && <span className="ml-1 text-indigo-500">&middot; Overnight</span>}
            </div>
            {!!(shift.assigned_staff_id) && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>Staff 1: <strong>{shift.staff_name as string}</strong></span>
                  <button onClick={handleUnassign} className="text-red-500 hover:text-red-700 flex items-center gap-0.5 font-medium">
                    <X size={12} /> Unassign
                  </button>
                </div>
                {!!(shift.second_staff_name) && (
                  <div className="flex items-center justify-between text-xs">
                    <span>Staff 2: <strong>{shift.second_staff_name as string}</strong></span>
                    <button onClick={handleUnassignSecond} className="text-red-500 hover:text-red-700 flex items-center gap-0.5 font-medium">
                      <X size={12} /> Unassign
                    </button>
                  </div>
                )}
                {(shift.staffing_ratio as number) >= 2 && !shift.second_staff_id && (
                  <div className="text-xs text-amber-600 font-medium">Needs 2nd staff ({String(shift.staffing_ratio)}:1 ratio)</div>
                )}
              </div>
            )}
          </div>

          {/* Edit form — toggled */}
          {editing && (
            <div className="p-3 border rounded-lg bg-blue-50/30 space-y-2">
              <div className="text-xs font-medium text-gray-600 mb-1">Edit Shift</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Start</label>
                  <input type="time" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">End</label>
                  <input type="time" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Type</label>
                  <select value={editShiftType} onChange={e => setEditShiftType(e.target.value)} className="w-full border rounded px-2 py-1 text-xs">
                    <option value="regular">Regular</option>
                    <option value="overnight">Overnight</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Activity</label>
                  <select value={editActivityType} onChange={e => setEditActivityType(e.target.value)} className="w-full border rounded px-2 py-1 text-xs">
                    <option value="general">General</option>
                    <option value="swimming">Swimming</option>
                    <option value="community">Community</option>
                    <option value="massage">Massage</option>
                    <option value="vocational">Vocational</option>
                    <option value="academic_support">Academic Support</option>
                    <option value="training">Training</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={editSwim} onChange={e => setEditSwim(e.target.checked)} className="rounded" />
                Needs swim support
              </label>
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                  <Save size={11} /> Save Changes
                </button>
                <button onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          )}

          {/* Notes section */}
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
        <div className="space-y-1.5 max-h-[50vh] sm:max-h-[400px] overflow-y-auto">
          {(candidates as CandidateScore[]).map((c) => (
            <div
              key={c.staffId}
              className={`p-2.5 rounded-lg border text-xs ${
                c.excluded ? "bg-gray-50 border-gray-100 opacity-50"
                : c.warnings.length > 0 ? "bg-amber-50/50 border-amber-200"
                : "bg-white border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{c.staffName}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    c.totalScore >= 70 ? "bg-green-100 text-green-700" :
                    c.totalScore >= 40 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>{c.totalScore}</span>
                </div>
                {!c.excluded && (() => {
                  const isAssigningSecond = shift && shift.assigned_staff_id && !shift.second_staff_id && (shift.staffing_ratio as number) >= 2;
                  return (
                    <button
                      onClick={() => handleAssign(c.staffId, c, !!isAssigningSecond)}
                      disabled={assigning === c.staffId}
                      className={`flex items-center gap-1 px-2 py-1 text-white rounded text-[11px] disabled:opacity-50 ${isAssigningSecond ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
                    >
                      <Check size={11} /> {isAssigningSecond ? "Assign 2nd" : "Assign"}
                    </button>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-0.5 mb-1">
                {c.tags.map((tag, i) => {
                  const variant = tag.includes("trained") && !tag.includes("not") ? "success"
                    : tag.includes("not") || tag.includes("conflict") || tag.includes("PTO") || tag.includes("cascade") || tag.includes("elsewhere") ? "error"
                    : tag.includes("heavy") || tag.includes("avoid") || /\dx/.test(tag) ? "warning" : "info";
                  return <Badge key={i} variant={variant} className="text-[9px] px-1 py-0">{tag}</Badge>;
                })}
              </div>
              {c.excluded && c.excludeReason && (
                <div className="text-[10px] text-red-500 flex items-center gap-0.5"><X size={10} /> {c.excludeReason}</div>
              )}
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

      {candidates && (candidates as CandidateScore[]).some(c => c.warnings.length > 0 && !c.excluded) && (
        <div className="mt-3 pt-3 border-t">
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Override note (for imperfect assignments)</label>
          <input value={overrideNote} onChange={e => setOverrideNote(e.target.value)} className="w-full border rounded px-2 py-1 text-xs" placeholder="Reason for override..." />
        </div>
      )}
    </Modal>
  );
}
