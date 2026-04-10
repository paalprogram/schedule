"use client";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatTime } from "@/lib/utils";
import {
  AlertTriangle, Droplets, Moon, PhoneOff, UserX,
  GraduationCap, Users, Heart, Briefcase, BookOpen, Dumbbell, StickyNote,
} from "lucide-react";

const ACTIVITY_ICONS: Record<string, { icon: typeof Droplets; color: string; label: string }> = {
  swimming: { icon: Droplets, color: "text-blue-500", label: "Swim" },
  massage: { icon: Heart, color: "text-pink-500", label: "Massage" },
  vocational: { icon: Briefcase, color: "text-amber-600", label: "Vocational" },
  academic_support: { icon: BookOpen, color: "text-emerald-600", label: "Academics" },
  training: { icon: Dumbbell, color: "text-cyan-600", label: "Training" },
};

interface ShiftCardProps {
  shift: Record<string, unknown>;
  warnings: Array<{ severity: string; message: string }>;
  onClick: () => void;
  onCallout: (shiftId: number) => void;
  onDragStart?: (shiftId: number) => void;
  onDragEnd?: () => void;
}

export function ShiftCard({ shift, warnings, onClick, onCallout, onDragStart, onDragEnd }: ShiftCardProps) {
  const { toast } = useToast();
  const confirm = useConfirm();

  const activityType = shift.activity_type as string;
  const isOpen = !shift.assigned_staff_id || shift.status === "open" || shift.status === "called_out";
  const isSwim = shift.needs_swim_support || activityType === "swimming";
  const isOvernight = shift.shift_type === "overnight";
  const isAbsent = !!shift.studentAbsent;
  const hasNote = !!(shift.override_note || shift.notes);
  const onboardingDay = shift.onboardingDay as number | null;
  const onboardingTotal = shift.onboardingTotalDays as number | null;
  const groupName = shift.group_name as string | null;
  const activity = ACTIVITY_ICONS[activityType];

  async function handleCallout(e: React.MouseEvent) {
    e.stopPropagation();
    if (!shift.assigned_staff_id) return;
    if (!await confirm({ message: `Mark ${shift.staff_name} as called out for this shift?`, confirmText: "Mark Called Out", variant: "danger" })) return;
    await fetch("/api/callouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shift_id: shift.id, original_staff_id: shift.assigned_staff_id, reason: "Called out" }),
    });
    toast(`${shift.staff_name} marked as called out`, "warning");
    onCallout(shift.id as number);
  }

  // Card border/bg color
  const cardStyle = isAbsent
    ? "bg-gray-50 border-gray-200 opacity-50"
    : isOpen
    ? "bg-red-50 border-red-200 hover:border-red-300"
    : warnings.length > 0
    ? "bg-amber-50/60 border-amber-200 hover:border-amber-300"
    : "bg-white border-gray-200 hover:border-blue-300";

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(shift.id)); e.dataTransfer.effectAllowed = "move"; onDragStart?.(shift.id as number); }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onClick}
      className={`rounded-md p-2 sm:p-1.5 text-xs sm:text-[11px] cursor-grab active:cursor-grabbing border transition-colors ${cardStyle}`}
    >
      {/* Row 1: Student name + icons */}
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className={`font-semibold truncate leading-tight ${isAbsent ? "text-gray-400 line-through" : "text-gray-900"}`}>
          {shift.student_name as string}
        </span>
        <div className="flex items-center gap-px shrink-0">
          {isAbsent && <UserX size={11} className="text-gray-400" />}
          {isSwim && <Droplets size={11} className="text-blue-500" />}
          {activity && !isSwim && <activity.icon size={11} className={activity.color} />}
          {isOvernight && <Moon size={11} className="text-indigo-400" />}
          {hasNote && <StickyNote size={11} className="text-yellow-400" />}
        </div>
      </div>

      {/* Badges row: OUT, group, activity label */}
      {(isAbsent || groupName || (activity && !isSwim)) && (
        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
          {isAbsent && <Badge variant="default">OUT</Badge>}
          {groupName && (
            <span className="inline-flex items-center gap-0.5 text-purple-600 text-[9px] font-medium">
              <Users size={9} />{groupName}
            </span>
          )}
          {activity && !isSwim && (
            <span className={`text-[9px] font-medium ${activity.color}`}>{activity.label}</span>
          )}
        </div>
      )}

      {/* Time */}
      <div className="text-gray-400 leading-tight">
        {formatTime(shift.start_time as string)}-{formatTime(shift.end_time as string)}
      </div>

      {/* Assignment */}
      {isOpen ? (
        <div className="mt-0.5"><Badge variant="error">OPEN</Badge></div>
      ) : (
        <div className="mt-0.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-gray-700 font-medium truncate">{shift.staff_name as string}</span>
            <button onClick={handleCallout} className="text-gray-300 hover:text-red-500 shrink-0" title="Mark callout">
              <PhoneOff size={11} />
            </button>
          </div>
          {onboardingDay !== null && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <GraduationCap size={9} className="text-teal-600" />
              <span className="text-teal-700 font-medium text-[9px]">
                {onboardingDay === 1 ? "First Day" : `Day ${onboardingDay}`}{onboardingTotal ? `/${onboardingTotal}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Notes (only override shown on card, details in panel) */}
      {!!(shift.override_note) && (
        <div className="mt-0.5 text-orange-500 truncate text-[9px]">{shift.override_note as string}</div>
      )}

      {/* Warning */}
      {warnings.length > 0 && (
        <div className="mt-0.5 flex items-center gap-0.5">
          <AlertTriangle size={9} className="text-amber-500 shrink-0" />
          <span className="text-amber-600 truncate text-[9px]">{warnings[0].message}</span>
        </div>
      )}
    </div>
  );
}
