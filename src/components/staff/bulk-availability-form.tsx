"use client";
import { useState } from "react";
import { useStaff } from "@/lib/hooks";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SHORT_DAYS } from "@/lib/utils";

interface BulkAvailabilityFormProps {
  onClose: () => void;
  onCreated: () => void;
}

export function BulkAvailabilityForm({ onClose, onCreated }: BulkAvailabilityFormProps) {
  const { data: staff } = useStaff();
  const { toast } = useToast();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<number[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("15:00");
  const [replaceExisting, setReplaceExisting] = useState(false);

  const activeStaff = staff?.filter((s: Record<string, unknown>) => s.active) || [];

  function toggleStaff(id: number) {
    setSelectedStaff(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedStaff.length === activeStaff.length) {
      setSelectedStaff([]);
    } else {
      setSelectedStaff(activeStaff.map((s: Record<string, unknown>) => s.id as number));
    }
  }

  function toggleDay(day: number) {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (selectedStaff.length === 0) {
      setError("Select at least one staff member");
      return;
    }
    if (selectedDays.length === 0) {
      setError("Select at least one day");
      return;
    }

    setCreating(true);

    let created = 0;
    let failed = 0;

    for (const staffId of selectedStaff) {
      // If replacing, delete existing availability for the selected days first
      if (replaceExisting) {
        for (const day of selectedDays) {
          await fetch(`/api/availability/bulk-clear`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ staff_id: staffId, day_of_week: day }),
          });
        }
      }

      for (const day of selectedDays) {
        const res = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_id: staffId,
            day_of_week: day,
            start_time: startTime,
            end_time: endTime,
          }),
        });
        if (res.ok) created++;
        else failed++;
      }
    }

    setCreating(false);

    if (created === 0) {
      setError("Failed to create availability slots");
      return;
    }

    toast(`${created} availability slot${created !== 1 ? "s" : ""} created for ${selectedStaff.length} staff`);
    if (failed > 0) {
      toast(`${failed} slot(s) failed`, "warning");
    }

    onCreated();
    onClose();
  }

  const totalSlots = selectedStaff.length * selectedDays.length;
  const allSelected = activeStaff.length > 0 && selectedStaff.length === activeStaff.length;

  return (
    <Modal open={true} onClose={onClose} title="Bulk Set Availability" wide>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

        {/* Staff multi-select */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-600">
              Staff <span className="text-gray-400 font-normal">({selectedStaff.length} selected)</span>
            </label>
            <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800">
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="border rounded-lg p-2 max-h-[180px] overflow-y-auto bg-white">
            <div className="flex flex-wrap gap-1.5">
              {activeStaff.map((s: Record<string, unknown>) => {
                const isSelected = selectedStaff.includes(s.id as number);
                return (
                  <button
                    key={s.id as number}
                    type="button"
                    onClick={() => toggleStaff(s.id as number)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {s.name as string}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Day selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Days</label>
          <div className="flex gap-1.5 flex-wrap">
            {[0, 1, 2, 3, 4, 5, 6].map(day => {
              const isSelected = selectedDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {SHORT_DAYS[day]}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-1.5">
            <button type="button" onClick={() => setSelectedDays([1, 2, 3, 4, 5])} className="text-[11px] text-blue-600 hover:text-blue-800">
              Mon-Fri
            </button>
            <button type="button" onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])} className="text-[11px] text-blue-600 hover:text-blue-800">
              Every Day
            </button>
            <button type="button" onClick={() => setSelectedDays([0, 6])} className="text-[11px] text-blue-600 hover:text-blue-800">
              Weekends
            </button>
          </div>
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Replace option */}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} className="rounded" />
          Replace existing availability for selected days
          <span className="text-[11px] text-gray-400">(deletes old slots first)</span>
        </label>

        {/* Summary */}
        {totalSlots > 0 && (
          <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Will create {totalSlots} availability slot{totalSlots !== 1 ? "s" : ""}
            ({selectedStaff.length} staff &times; {selectedDays.length} day{selectedDays.length !== 1 ? "s" : ""}: {selectedDays.sort((a, b) => a - b).map(d => SHORT_DAYS[d]).join(", ")}, {startTime}-{endTime})
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            type="submit"
            disabled={creating || selectedStaff.length === 0 || selectedDays.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : `Set ${totalSlots} Slot${totalSlots !== 1 ? "s" : ""}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
