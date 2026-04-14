"use client";
import { useState } from "react";
import { useStudents } from "@/lib/hooks";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SHORT_DAYS } from "@/lib/utils";

interface BulkAddShiftFormProps {
  date: string;
  onClose: () => void;
  onCreated: () => void;
}

function getDateForDay(baseDate: string, targetDay: number): string {
  const d = new Date(baseDate + "T00:00:00");
  const currentDay = d.getDay();
  const diff = targetDay - currentDay;
  const target = new Date(d);
  target.setDate(d.getDate() + diff);
  return target.toISOString().split("T")[0];
}

export function BulkAddShiftForm({ date, onClose, onCreated }: BulkAddShiftFormProps) {
  const { data: students } = useStudents();
  const { toast } = useToast();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);

  const baseDayOfWeek = new Date(date + "T00:00:00").getDay();
  const [additionalDays, setAdditionalDays] = useState<number[]>([]);

  const activeStudents = students?.filter((s: Record<string, unknown>) => s.active) || [];

  function toggleStudent(id: number) {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedStudents.length === activeStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(activeStudents.map((s: Record<string, unknown>) => s.id as number));
    }
  }

  function toggleDay(day: number) {
    setAdditionalDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (selectedStudents.length === 0) {
      setError("Select at least one student");
      return;
    }

    setCreating(true);

    const form = new FormData(e.currentTarget);
    const shiftData = {
      start_time: form.get("start_time"),
      end_time: form.get("end_time"),
      shift_type: form.get("shift_type"),
      activity_type: form.get("activity_type"),
      needs_swim_support: form.get("needs_swim_support") === "on",
      notes: form.get("notes") || null,
    };

    const dates = [date, ...additionalDays.map(day => getDateForDay(date, day))];
    const uniqueDates = [...new Set(dates)];

    let created = 0;
    let failed = 0;
    let lastError = "";

    for (const studentId of selectedStudents) {
      // Get staffing ratio for this student (2:1 students need 2 shifts per slot)
      const studentData = activeStudents.find((s: Record<string, unknown>) => s.id === studentId);
      const ratio = (studentData?.staffing_ratio as number) || 1;

      for (const d of uniqueDates) {
        for (let slot = 0; slot < ratio; slot++) {
          const res = await fetch("/api/shifts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...shiftData, student_id: studentId, date: d }),
          });
          if (res.ok) {
            created++;
          } else {
            failed++;
            const data = await res.json().catch(() => null);
            lastError = data?.details?.[0]?.message || data?.error || "Failed to create shift";
          }
        }
      }
    }

    setCreating(false);

    if (created === 0) {
      setError(lastError || "Failed to create shifts");
      return;
    }

    toast(`${created} shift${created > 1 ? "s" : ""} created for ${selectedStudents.length} student${selectedStudents.length > 1 ? "s" : ""}`);

    if (failed > 0) {
      toast(`${failed} shift(s) failed: ${lastError}`, "warning");
    }

    onCreated();
    onClose();
  }

  // Calculate total shifts accounting for each student's ratio
  const totalShifts = selectedStudents.reduce((sum, studentId) => {
    const studentData = activeStudents.find((s: Record<string, unknown>) => s.id === studentId);
    const ratio = (studentData?.staffing_ratio as number) || 1;
    return sum + ratio * (1 + additionalDays.length);
  }, 0);
  const has2to1 = selectedStudents.some(studentId => {
    const studentData = activeStudents.find((s: Record<string, unknown>) => s.id === studentId);
    return ((studentData?.staffing_ratio as number) || 1) > 1;
  });
  const allSelected = activeStudents.length > 0 && selectedStudents.length === activeStudents.length;

  return (
    <Modal open={true} onClose={onClose} title={`Bulk Add Shifts — ${date}`} wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

        {/* Student multi-select */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-600">
              Students <span className="text-gray-400 font-normal">({selectedStudents.length} selected)</span>
            </label>
            <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800">
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="border rounded-lg p-2 max-h-[180px] overflow-y-auto bg-white">
            <div className="flex flex-wrap gap-1.5">
              {activeStudents.map((s: Record<string, unknown>) => {
                const isSelected = selectedStudents.includes(s.id as number);
                const sRatio = (s.staffing_ratio as number) || 1;
                return (
                  <button
                    key={s.id as number}
                    type="button"
                    onClick={() => toggleStudent(s.id as number)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {s.name as string}
                    {sRatio > 1 && <span className={`ml-1 ${isSelected ? "text-blue-200" : "text-amber-500"}`}>({sRatio}:1)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
            <input name="start_time" type="time" defaultValue="08:00" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
            <input name="end_time" type="time" defaultValue="14:00" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shift Type</label>
            <select name="shift_type" className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="regular">Regular</option>
              <option value="overnight">Overnight</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Activity</label>
            <select name="activity_type" className="w-full border rounded-lg px-3 py-2 text-sm">
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

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" name="needs_swim_support" className="rounded" />
          Needs swim support
        </label>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <input name="notes" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="See Kaitlin, In @10:30..." />
        </div>

        {/* Multi-day selector */}
        <div className="border rounded-lg p-3 bg-gray-50">
          <label className="block text-xs font-medium text-gray-600 mb-2">Days to create shifts</label>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 2, 3, 4, 5].map(day => {
              const isBase = day === baseDayOfWeek;
              const isSelected = additionalDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isBase}
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isBase
                      ? "bg-blue-600 text-white cursor-default"
                      : isSelected
                      ? "bg-blue-100 text-blue-700 border border-blue-300"
                      : "bg-white border border-gray-200 text-gray-500 hover:border-blue-300"
                  }`}
                >
                  {SHORT_DAYS[day]}
                  {isBase && " (current)"}
                </button>
              );
            })}
          </div>
          {(selectedStudents.length > 0 || additionalDays.length > 0) && (
            <div className="mt-1.5 text-[11px] text-gray-500">
              Will create {totalShifts} shift{totalShifts !== 1 ? "s" : ""} total
              ({selectedStudents.length} student{selectedStudents.length !== 1 ? "s" : ""} &times; {1 + additionalDays.length} day{additionalDays.length > 0 ? "s" : ""}{has2to1 ? ", incl. extra slots for 2:1 students" : ""})
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            type="submit"
            disabled={creating || selectedStudents.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : `Create ${totalShifts} Shift${totalShifts !== 1 ? "s" : ""}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
