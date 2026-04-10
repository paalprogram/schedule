"use client";
import { useState } from "react";
import { useStaff } from "@/lib/hooks";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";

interface StaffOutFormProps {
  weekStart: string;
  weekEnd: string;
  onClose: () => void;
  onDone: () => void;
}

export function StaffOutForm({ weekStart, weekEnd, onClose, onDone }: StaffOutFormProps) {
  const { data: allStaff } = useStaff();
  const { toast } = useToast();
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [autoReassign, setAutoReassign] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId || !date) return;

    setSubmitting(true);
    setResult(null);

    const res = await fetch("/api/staff-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staff_id: parseInt(staffId),
        date,
        reason: reason || undefined,
        auto_reassign: autoReassign,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      toast(data.error || "Failed to mark staff out", "warning");
      return;
    }

    setResult(data);

    if (data.shiftsAffected === 0) {
      toast(`${data.staffName} marked OUT on ${date} (no shifts affected)`);
    } else if (data.reassignFailed === 0) {
      toast(`${data.staffName} marked OUT — all ${data.reassigned} shift(s) reassigned`);
    } else {
      toast(`${data.staffName} marked OUT — ${data.reassigned} reassigned, ${data.reassignFailed} still need coverage`, "warning");
    }

    onDone();
  }

  // Build date options for the current week
  const dates: { value: string; label: string }[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split("T")[0];
    dates.push({ value: iso, label: `${dayNames[d.getDay()]} ${iso}` });
  }

  return (
    <Modal open={true} onClose={onClose} title="Mark Staff OUT">
      {!result ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Staff Member</label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)} required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select staff...</option>
              {allStaff?.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
                <option key={s.id as number} value={String(s.id)}>{s.name as string}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <select value={date} onChange={e => setDate(e.target.value)} required className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select date...</option>
              {dates.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={reason} onChange={e => setReason(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="PTO, sick, personal day..." />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={autoReassign} onChange={e => setAutoReassign(e.target.checked)} className="rounded" />
            Automatically reassign their shifts to available staff
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
              {submitting ? "Processing..." : "Mark OUT"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <div className="font-semibold">{result.staffName as string} — OUT on {result.date as string}</div>
            <div className="text-xs text-gray-500 mt-1">
              {result.shiftsAffected as number} shift(s) affected
              {(result.ptoCreated as boolean) && " · PTO record created"}
            </div>
          </div>

          {(result.details as Array<{ student: string; newStaff: string | null }>)?.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500">Shift reassignments:</div>
              {(result.details as Array<{ student: string; newStaff: string | null }>).map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 bg-white border rounded">
                  <span>{d.student}</span>
                  {d.newStaff ? (
                    <Badge variant="success">{d.newStaff}</Badge>
                  ) : (
                    <Badge variant="error">Needs coverage</Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800">Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
