"use client";
import { useState, useEffect, use } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ArrowLeft, Plus, Trash2, Edit2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/ui/error-banner";
import Link from "next/link";
import { SHORT_DAYS } from "@/lib/utils";

interface AvailabilitySlot {
  id: number; day_of_week: number; start_time: string; end_time: string;
}

interface StaffDetail {
  id: number; name: string; role: string; active: number;
  can_work_overnight: number; can_cover_swim: number;
  max_hours_per_week: number | null; notes: string | null;
  availability: AvailabilitySlot[];
  pto: Array<{ id: number; start_date: string; end_date: string; reason: string | null }>;
  training: Array<{ student_id: number; student_name: string }>;
}

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [showPto, setShowPto] = useState(false);
  const [allStudents, setAllStudents] = useState<Array<{ id: number; name: string }>>([]);
  const [showTraining, setShowTraining] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [editingAvail, setEditingAvail] = useState<AvailabilitySlot | null>(null);
  const [loadError, setLoadError] = useState(false);

  function reload() {
    setLoadError(false);
    fetch(`/api/staff/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setStaff)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    reload();
    fetch("/api/students").then(r => r.json()).then(setAllStudents);
  }, [id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch(`/api/staff/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        role: form.get("role"),
        active: form.get("active") === "on",
        can_work_overnight: form.get("can_work_overnight") === "on",
        can_cover_swim: form.get("can_cover_swim") === "on",
        max_hours_per_week: form.get("max_hours_per_week") ? parseInt(form.get("max_hours_per_week") as string) : null,
        notes: form.get("notes") || null,
      }),
    });
    toast("Staff profile saved");
    reload();
  }

  async function addPto(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const currentPto = staff?.pto || [];
    await fetch(`/api/staff/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: staff?.name, role: staff?.role, active: !!staff?.active,
        can_work_overnight: !!staff?.can_work_overnight,
        can_cover_swim: !!staff?.can_cover_swim,
        max_hours_per_week: staff?.max_hours_per_week,
        notes: staff?.notes,
        pto: [...currentPto, {
          start_date: form.get("start_date"),
          end_date: form.get("end_date"),
          reason: form.get("reason") || null,
        }],
      }),
    });
    setShowPto(false);
    toast("PTO entry added");
    reload();
  }

  async function deletePto(ptoId: number) {
    if (!await confirm({ message: "Remove this PTO entry?", variant: "danger", confirmText: "Remove" })) return;
    const updatedPto = (staff?.pto || []).filter(p => p.id !== ptoId);
    await fetch(`/api/staff/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: staff?.name, role: staff?.role, active: !!staff?.active,
        can_work_overnight: !!staff?.can_work_overnight,
        can_cover_swim: !!staff?.can_cover_swim,
        max_hours_per_week: staff?.max_hours_per_week,
        notes: staff?.notes,
        pto: updatedPto,
      }),
    });
    toast("PTO entry removed");
    reload();
  }

  async function addTraining(studentId: number) {
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: parseInt(id), student_id: studentId }),
    });
    setShowTraining(false);
    toast("Training assignment added");
    reload();
  }

  async function removeTraining(studentId: number) {
    if (!await confirm({ message: "Remove this training assignment?", variant: "danger", confirmText: "Remove" })) return;
    await fetch(`/api/training?staffId=${id}&studentId=${studentId}`, { method: "DELETE" });
    toast("Training assignment removed");
    reload();
  }

  async function handleAvailabilitySave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      staff_id: parseInt(id),
      day_of_week: parseInt(form.get("day_of_week") as string),
      start_time: form.get("start_time"),
      end_time: form.get("end_time"),
    };

    if (editingAvail) {
      await fetch(`/api/availability/${editingAvail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Availability slot updated");
    } else {
      await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Availability slot added");
    }

    setShowAvailability(false);
    setEditingAvail(null);
    reload();
  }

  async function deleteAvailability(slotId: number) {
    if (!await confirm({ message: "Remove this availability slot?", variant: "danger", confirmText: "Remove" })) return;
    await fetch(`/api/availability/${slotId}`, { method: "DELETE" });
    toast("Availability slot removed");
    reload();
  }

  async function handleHardDelete() {
    if (!staff) return;
    const ok = await confirm({
      title: "Permanently delete this staff member?",
      message: `This permanently removes ${staff.name} and all of their data:\n\n• Availability, PTO, training, preferences, onboarding records\n• Meeting attendance and dedicated-role assignments\n• Callout records where they were the original staff\n\nFuture and current shifts they're assigned to will have their slot freed up (other history preserved). This cannot be undone.\n\nIf you only want to stop scheduling them for now, use the Active checkbox instead.`,
      confirmText: "Delete Permanently",
      variant: "danger",
      requireTypedText: "DELETE",
    });
    if (!ok) return;
    const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Failed to delete staff member", "warning");
      return;
    }
    toast(`${staff.name} permanently deleted`, "warning");
    router.push("/staff");
  }

  if (loadError) return (
    <div className="py-8">
      <ErrorBanner message="Failed to load staff profile." onRetry={reload} />
    </div>
  );
  if (!staff) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const trainedIds = new Set(staff.training.map(t => t.student_id));
  const untrainedStudents = allStudents.filter(s => !trainedIds.has(s.id));

  // Group availability by day for display
  const availByDay = new Map<number, AvailabilitySlot[]>();
  for (const a of staff.availability) {
    const list = availByDay.get(a.day_of_week) || [];
    list.push(a);
    availByDay.set(a.day_of_week, list);
  }

  return (
    <div>
      <Link href="/staff" className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4">
        <ArrowLeft size={16} /> Back to Staff
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Staff Profile</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input name="name" defaultValue={staff.name} required className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select name="role" defaultValue={staff.role} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="direct_care">Direct Care</option>
                  <option value="lead">Lead</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={!!staff.active} className="rounded" />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="can_cover_swim" defaultChecked={!!staff.can_cover_swim} className="rounded" />
                Swim Certified
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="can_work_overnight" defaultChecked={!!staff.can_work_overnight} className="rounded" />
                Overnight Available
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Hours/Week</label>
              <input name="max_hours_per_week" type="number" defaultValue={staff.max_hours_per_week ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea name="notes" defaultValue={staff.notes ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Save Changes</button>
          </form>

          {/* Danger zone — irreversible permanent delete */}
          <div className="mt-6 pt-6 border-t border-red-100">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900">Danger Zone</h3>
                <p className="text-xs text-red-700 mt-1 mb-3">
                  Permanently delete this staff member and all of their data. This cannot be undone.
                  To stop scheduling them without losing data, uncheck Active above instead.
                </p>
                <button
                  type="button"
                  onClick={handleHardDelete}
                  className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700"
                >
                  <Trash2 size={14} /> Delete Permanently
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Availability */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Weekly Availability</h3>
              <button
                onClick={() => { setEditingAvail(null); setShowAvailability(true); }}
                className="text-blue-600 hover:text-blue-800"
              >
                <Plus size={16} />
              </button>
            </div>
            {staff.availability.length === 0 ? (
              <p className="text-sm text-gray-500">No availability set. Add slots to enable scheduling.</p>
            ) : (
              <div className="space-y-1">
                {[0, 1, 2, 3, 4, 5, 6].map(day => {
                  const slots = availByDay.get(day);
                  if (!slots) return null;
                  return slots.map(a => (
                    <div key={a.id} className="text-sm flex items-center justify-between group">
                      <div className="flex items-center gap-2">
                        <span className="font-medium w-10">{SHORT_DAYS[a.day_of_week]}</span>
                        <span className="text-gray-600">{a.start_time} - {a.end_time}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingAvail(a); setShowAvailability(true); }}
                          className="text-blue-500 hover:text-blue-700 p-0.5"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => deleteAvailability(a.id)}
                          className="text-red-400 hover:text-red-600 p-0.5"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ));
                })}
              </div>
            )}
          </div>

          {/* PTO */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">PTO / Time Off</h3>
              <button onClick={() => setShowPto(true)} className="text-blue-600 hover:text-blue-800">
                <Plus size={16} />
              </button>
            </div>
            {staff.pto.length === 0 ? (
              <p className="text-sm text-gray-500">No PTO scheduled</p>
            ) : (
              <div className="space-y-2">
                {staff.pto.map(p => (
                  <div key={p.id} className="text-sm bg-yellow-50 rounded p-2 group">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.start_date} to {p.end_date}</div>
                      <button
                        onClick={() => deletePto(p.id)}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {p.reason && <div className="text-gray-600">{p.reason}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Training */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Trained Students</h3>
              {untrainedStudents.length > 0 && (
                <button onClick={() => setShowTraining(true)} className="text-blue-600 hover:text-blue-800">
                  <Plus size={16} />
                </button>
              )}
            </div>
            {staff.training.length === 0 ? (
              <p className="text-sm text-gray-500">No training assignments</p>
            ) : (
              <div className="space-y-1">
                {staff.training.map(t => (
                  <div key={t.student_id} className="flex items-center justify-between text-sm">
                    <span>{t.student_name}</span>
                    <button onClick={() => removeTraining(t.student_id)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Availability Modal */}
      <Modal
        open={showAvailability}
        onClose={() => { setShowAvailability(false); setEditingAvail(null); }}
        title={editingAvail ? "Edit Availability" : "Add Availability Slot"}
      >
        <form onSubmit={handleAvailabilitySave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
            <select name="day_of_week" defaultValue={editingAvail?.day_of_week ?? 1} className="w-full border rounded-lg px-3 py-2 text-sm">
              {SHORT_DAYS.map((day, i) => (
                <option key={i} value={i}>{day} ({["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][i]})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input name="start_time" type="time" defaultValue={editingAvail?.start_time ?? "07:00"} required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input name="end_time" type="time" defaultValue={editingAvail?.end_time ?? "15:00"} required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            For overnight availability, set start time after end time (e.g. 21:00 - 07:00).
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowAvailability(false); setEditingAvail(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              {editingAvail ? "Save Changes" : "Add Slot"}
            </button>
          </div>
        </form>
      </Modal>

      {/* PTO Modal */}
      <Modal open={showPto} onClose={() => setShowPto(false)} title="Add PTO">
        <form onSubmit={addPto} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input name="start_date" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input name="end_date" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input name="reason" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowPto(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add PTO</button>
          </div>
        </form>
      </Modal>

      {/* Training Modal */}
      <Modal open={showTraining} onClose={() => setShowTraining(false)} title="Add Student Training">
        <div className="space-y-2">
          {untrainedStudents.map(s => (
            <button
              key={s.id}
              onClick={() => addTraining(s.id)}
              className="w-full text-left px-4 py-2 rounded-lg hover:bg-blue-50 text-sm border"
            >
              {s.name}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
