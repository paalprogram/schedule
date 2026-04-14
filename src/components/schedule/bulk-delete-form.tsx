"use client";
import { useState, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2 } from "lucide-react";
import { formatTime } from "@/lib/utils";

interface BulkDeleteFormProps {
  weekStart: string;
  weekEnd: string;
  days: Array<{
    date: string;
    dayName: string;
    shifts: Array<Record<string, unknown>>;
  }>;
  onClose: () => void;
  onDeleted: () => void;
}

type FilterStatus = "all" | "open" | "scheduled";

export function BulkDeleteForm({ weekStart, weekEnd, days, onClose, onDeleted }: BulkDeleteFormProps) {
  const { toast } = useToast();
  const [filterDay, setFilterDay] = useState<string>("all");
  const [filterStudent, setFilterStudent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Get all shifts across all days
  const allShifts = useMemo(() => days.flatMap(d => d.shifts), [days]);

  // Get unique students for filter
  const students = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of allShifts) {
      map.set(s.student_id as number, s.student_name as string);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allShifts]);

  // Filter shifts
  const filteredShifts = useMemo(() => {
    return allShifts.filter(s => {
      if (filterDay !== "all" && s.date !== filterDay) return false;
      if (filterStudent !== "all" && String(s.student_id) !== filterStudent) return false;
      if (filterStatus === "open" && s.assigned_staff_id) return false;
      if (filterStatus === "scheduled" && !s.assigned_staff_id) return false;
      return true;
    });
  }, [allShifts, filterDay, filterStudent, filterStatus]);

  function toggleShift(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const s of filteredShifts) next.add(s.id as number);
      return next;
    });
  }

  function deselectAllFiltered() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const s of filteredShifts) next.delete(s.id as number);
      return next;
    });
  }

  const selectedInView = filteredShifts.filter(s => selectedIds.has(s.id as number)).length;
  const allFilteredSelected = filteredShifts.length > 0 && selectedInView === filteredShifts.length;

  // Stats about what's selected
  const selectedShifts = allShifts.filter(s => selectedIds.has(s.id as number));
  const assignedCount = selectedShifts.filter(s => s.assigned_staff_id).length;

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch("/api/shifts/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shiftIds: Array.from(selectedIds) }),
    });
    const data = await res.json();
    setDeleting(false);

    if (res.ok) {
      toast(`${data.deleted} shift${data.deleted !== 1 ? "s" : ""} deleted`, "warning");
      onDeleted();
      onClose();
    } else {
      toast(data.error || "Failed to delete shifts", "error");
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Bulk Delete — ${weekStart} to ${weekEnd}`} wide>
      {step === "select" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select value={filterDay} onChange={e => setFilterDay(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="all">All Days</option>
              {days.map(d => (
                <option key={d.date} value={d.date}>{d.dayName} ({d.date})</option>
              ))}
            </select>
            <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="all">All Students</option>
              {students.map(([id, name]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)} className="border rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="all">All Statuses</option>
              <option value="open">Open Only</option>
              <option value="scheduled">Assigned Only</option>
            </select>
          </div>

          {/* Select all / deselect */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {filteredShifts.length} shift{filteredShifts.length !== 1 ? "s" : ""} shown, {selectedIds.size} selected total
            </span>
            <button
              type="button"
              onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {allFilteredSelected ? "Deselect All Shown" : "Select All Shown"}
            </button>
          </div>

          {/* Shift list */}
          <div className="border rounded-lg max-h-[300px] overflow-y-auto divide-y">
            {filteredShifts.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No shifts match filters</div>
            ) : (
              filteredShifts.map(s => {
                const isSelected = selectedIds.has(s.id as number);
                const isOpen = !s.assigned_staff_id || s.status === "open";
                return (
                  <label key={s.id as number} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${isSelected ? "bg-red-50" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleShift(s.id as number)}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium truncate">{s.student_name as string}</span>
                        {isOpen ? (
                          <Badge variant="error">OPEN</Badge>
                        ) : (
                          <span className="text-gray-500 text-xs truncate">{s.staff_name as string}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {s.date as string} &middot; {formatTime(s.start_time as string)}-{formatTime(s.end_time as string)}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setStep("confirm")}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete {selectedIds.size} Shift{selectedIds.size !== 1 ? "s" : ""}...
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-red-700 font-semibold">
              <AlertTriangle size={18} />
              This cannot be undone
            </div>
            <p className="text-sm text-red-600">
              You are about to permanently delete <strong>{selectedIds.size} shift{selectedIds.size !== 1 ? "s" : ""}</strong>.
            </p>
            {assignedCount > 0 && (
              <p className="text-sm text-red-700 font-medium">
                {assignedCount} of these {assignedCount === 1 ? "has" : "have"} staff assigned.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="DELETE"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => { setStep("select"); setConfirmText(""); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Back
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmText !== "DELETE" || deleting}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 size={14} /> {deleting ? "Deleting..." : `Permanently Delete ${selectedIds.size} Shifts`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
