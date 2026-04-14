"use client";
import { useState } from "react";
import { useStudents } from "@/lib/hooks";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SHORT_DAYS } from "@/lib/utils";

interface AddShiftFormProps {
  date: string;
  onClose: () => void;
  onCreated: () => void;
}

/** Given a date string and a day-of-week (0=Sun), return the date for that day in the same week. */
function getDateForDay(baseDate: string, targetDay: number): string {
  const d = new Date(baseDate + "T00:00:00");
  const currentDay = d.getDay();
  const diff = targetDay - currentDay;
  const target = new Date(d);
  target.setDate(d.getDate() + diff);
  return target.toISOString().split("T")[0];
}

export function AddShiftForm({ date, onClose, onCreated }: AddShiftFormProps) {
  const { data: students } = useStudents();
  const { toast } = useToast();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const selectedStudent = students?.find((s: Record<string, unknown>) => s.id === selectedStudentId);
  const ratio = (selectedStudent?.staffing_ratio as number) || 1;

  // Multi-day: which additional days to also create this shift for
  const baseDayOfWeek = new Date(date + "T00:00:00").getDay();
  const [additionalDays, setAdditionalDays] = useState<number[]>([]);

  function toggleDay(day: number) {
    setAdditionalDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setCreating(true);

    const form = new FormData(e.currentTarget);
    const shiftData = {
      student_id: parseInt(form.get("student_id") as string),
      start_time: form.get("start_time"),
      end_time: form.get("end_time"),
      shift_type: form.get("shift_type"),
      activity_type: form.get("activity_type"),
      needs_swim_support: form.get("needs_swim_support") === "on",
      notes: form.get("notes") || null,
    };

    // All dates to create shifts for: the base date + any additional days
    const dates = [date, ...additionalDays.map(day => getDateForDay(date, day))];
    // Deduplicate (in case the base day was also toggled)
    const uniqueDates = [...new Set(dates)];

    // Get staffing ratio for this student (2:1 students need 2 shifts per slot)
    const selectedStudent = students?.find((s: Record<string, unknown>) => s.id === shiftData.student_id);
    const ratio = (selectedStudent?.staffing_ratio as number) || 1;

    let created = 0;
    let lastError = "";

    for (const d of uniqueDates) {
      for (let slot = 0; slot < ratio; slot++) {
        const res = await fetch("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...shiftData, date: d }),
        });
        if (res.ok) {
          created++;
        } else {
          const data = await res.json().catch(() => null);
          lastError = data?.details?.[0]?.message || data?.error || "Failed to create shift";
        }
      }
    }

    setCreating(false);

    if (created === 0) {
      setError(lastError || "Failed to create shift");
      return;
    }

    const expectedTotal = uniqueDates.length * ratio;
    if (created === 1) {
      toast("Shift created");
    } else if (ratio > 1) {
      toast(`${created} shifts created (${ratio}:1 ratio × ${uniqueDates.length} day${uniqueDates.length > 1 ? "s" : ""})`);
    } else {
      toast(`${created} shifts created across ${uniqueDates.length} day${uniqueDates.length > 1 ? "s" : ""}`);
    }

    if (lastError && created < expectedTotal) {
      toast(`${expectedTotal - created} shift(s) failed: ${lastError}`, "warning");
    }

    onCreated();
    onClose();
  }

  return (
    <Modal open={true} onClose={onClose} title={`Add Shift — ${date}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Student</label>
          <select
            name="student_id"
            required
            className="w-full border rounded-lg px-3 py-2 text-sm"
            onChange={e => setSelectedStudentId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Select student...</option>
            {students?.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
              <option key={s.id as number} value={s.id as number}>{s.name as string}</option>
            ))}
          </select>
          {ratio > 1 && (
            <div className="mt-1 text-xs text-amber-600 font-medium">
              {ratio}:1 ratio — will create {ratio} shifts per day (one per staff slot)
            </div>
          )}
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
          <label className="block text-xs font-medium text-gray-600 mb-2">Also create for other days this week</label>
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
          {(additionalDays.length > 0 || ratio > 1) && (
            <div className="mt-1.5 text-[11px] text-gray-500">
              Will create {(additionalDays.length + 1) * ratio} shift{(additionalDays.length + 1) * ratio > 1 ? "s" : ""} total
              {ratio > 1 && ` (${ratio} staff slots × ${additionalDays.length + 1} day${additionalDays.length > 0 ? "s" : ""})`}
              {ratio === 1 && ` (${[baseDayOfWeek, ...additionalDays].sort().map(d => SHORT_DAYS[d]).join(", ")})`}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={creating} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {creating ? "Creating..." : (() => {
              const total = (additionalDays.length + 1) * ratio;
              return total > 1 ? `Create ${total} Shifts` : "Create Shift";
            })()}
          </button>
        </div>
      </form>
    </Modal>
  );
}
