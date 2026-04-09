"use client";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatTime } from "@/lib/utils";
import { AlertTriangle, Droplets, Moon, PhoneOff } from "lucide-react";

interface ShiftCardProps {
  shift: Record<string, unknown>;
  warnings: Array<{ severity: string; message: string }>;
  onClick: () => void;
  onCallout: () => void;
}

export function ShiftCard({ shift, warnings, onClick, onCallout }: ShiftCardProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const isOpen = !shift.assigned_staff_id || shift.status === "open" || shift.status === "called_out";
  const isSwim = shift.needs_swim_support || shift.activity_type === "swimming";
  const isOvernight = shift.shift_type === "overnight";

  async function handleCallout(e: React.MouseEvent) {
    e.stopPropagation();
    if (!shift.assigned_staff_id) return;
    if (!await confirm({ message: `Mark ${shift.staff_name} as called out for this shift?`, confirmText: "Mark Called Out", variant: "danger" })) return;

    await fetch("/api/callouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shift_id: shift.id,
        original_staff_id: shift.assigned_staff_id,
        reason: "Called out",
      }),
    });
    toast(`${shift.staff_name} marked as called out`, "warning");
    onCallout();
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-lg p-2 text-xs cursor-pointer border transition-colors ${
        isOpen
          ? "bg-red-50 border-red-200 hover:border-red-300"
          : warnings.length > 0
          ? "bg-yellow-50 border-yellow-200 hover:border-yellow-300"
          : "bg-gray-50 border-gray-200 hover:border-blue-300"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-gray-900 truncate">{shift.student_name as string}</span>
        <div className="flex gap-0.5">
          {isSwim && <Droplets size={12} className="text-blue-500" />}
          {isOvernight && <Moon size={12} className="text-indigo-500" />}
        </div>
      </div>
      <div className="text-gray-500 mb-1">
        {formatTime(shift.start_time as string)} - {formatTime(shift.end_time as string)}
      </div>
      {isOpen ? (
        <Badge variant="error">UNCOVERED</Badge>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-gray-700 font-medium truncate">{shift.staff_name as string}</span>
          <button
            onClick={handleCallout}
            className="text-gray-400 hover:text-red-500 ml-1"
            title="Mark callout"
          >
            <PhoneOff size={12} />
          </button>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-1 flex items-center gap-1">
          <AlertTriangle size={10} className="text-yellow-600" />
          <span className="text-yellow-700 truncate">{warnings[0].message}</span>
        </div>
      )}
    </div>
  );
}
