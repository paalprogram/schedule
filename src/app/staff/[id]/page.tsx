"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { SHORT_DAYS } from "@/lib/utils";

interface StaffDetail {
  id: number; name: string; role: string; active: number;
  can_work_overnight: number; can_cover_swim: number;
  max_hours_per_week: number | null; notes: string | null;
  availability: Array<{ id: number; day_of_week: number; start_time: string; end_time: string }>;
  pto: Array<{ id: number; start_date: string; end_date: string; reason: string | null }>;
  training: Array<{ student_id: number; student_name: string }>;
}

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [showPto, setShowPto] = useState(false);
  const [allStudents, setAllStudents] = useState<Array<{ id: number; name: string }>>([]);
  const [showTraining, setShowTraining] = useState(false);

  useEffect(() => {
    fetch(`/api/staff/${id}`).then(r => r.json()).then(setStaff);
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
    fetch(`/api/staff/${id}`).then(r => r.json()).then(setStaff);
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
    fetch(`/api/staff/${id}`).then(r => r.json()).then(setStaff);
  }

  async function addTraining(studentId: number) {
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: parseInt(id), student_id: studentId }),
    });
    setShowTraining(false);
    fetch(`/api/staff/${id}`).then(r => r.json()).then(setStaff);
  }

  async function removeTraining(studentId: number) {
    await fetch(`/api/training?staffId=${id}&studentId=${studentId}`, { method: "DELETE" });
    fetch(`/api/staff/${id}`).then(r => r.json()).then(setStaff);
  }

  if (!staff) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const trainedIds = new Set(staff.training.map(t => t.student_id));
  const untrainedStudents = allStudents.filter(s => !trainedIds.has(s.id));

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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Availability */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-sm font-semibold mb-3">Weekly Availability</h3>
            {staff.availability.length === 0 ? (
              <p className="text-sm text-gray-500">No availability set</p>
            ) : (
              <div className="space-y-1">
                {staff.availability.map(a => (
                  <div key={a.id} className="text-sm flex justify-between">
                    <span className="font-medium">{SHORT_DAYS[a.day_of_week]}</span>
                    <span className="text-gray-600">{a.start_time} - {a.end_time}</span>
                  </div>
                ))}
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
                  <div key={p.id} className="text-sm bg-yellow-50 rounded p-2">
                    <div className="font-medium">{p.start_date} to {p.end_date}</div>
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
