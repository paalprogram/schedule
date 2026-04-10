"use client";
import { useState } from "react";
import { useStudents } from "@/lib/hooks";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface AddShiftFormProps {
  date: string;
  onClose: () => void;
  onCreated: () => void;
}

export function AddShiftForm({ date, onClose, onCreated }: AddShiftFormProps) {
  const { data: students } = useStudents();
  const { toast } = useToast();
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: parseInt(form.get("student_id") as string),
        date,
        start_time: form.get("start_time"),
        end_time: form.get("end_time"),
        shift_type: form.get("shift_type"),
        activity_type: form.get("activity_type"),
        needs_swim_support: form.get("needs_swim_support") === "on",
        notes: form.get("notes") || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.details?.[0]?.message || data?.error || "Failed to create shift");
      return;
    }
    toast("Shift created");
    onCreated();
    onClose();
  }

  return (
    <Modal open={true} onClose={onClose} title={`Add Shift — ${date}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Student</label>
          <select name="student_id" required className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Select student...</option>
            {students?.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
              <option key={s.id as number} value={s.id as number}>{s.name as string}</option>
            ))}
          </select>
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

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create Shift</button>
        </div>
      </form>
    </Modal>
  );
}
