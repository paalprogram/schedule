"use client";
import { useState, useEffect, use } from "react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { SHORT_DAYS } from "@/lib/utils";

interface StudentDetail {
  id: number; name: string; active: number;
  requires_swim_support: number; notes: string | null;
  trainedStaff: Array<{ staff_id: number; staff_name: string; can_cover_swim: number; can_work_overnight: number }>;
  templates: Array<{ id: number; day_of_week: number; start_time: string; end_time: string; shift_type: string; activity_type: string; needs_swim_support: number }>;
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [allStaff, setAllStaff] = useState<Array<{ id: number; name: string; active: number }>>([]);
  const [showStaff, setShowStaff] = useState(false);

  useEffect(() => {
    fetch(`/api/students/${id}`).then(r => r.json()).then(setStudent);
    fetch("/api/staff").then(r => r.json()).then(setAllStaff);
  }, [id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        active: form.get("active") === "on",
        requires_swim_support: form.get("requires_swim_support") === "on",
        notes: form.get("notes") || null,
      }),
    });
    fetch(`/api/students/${id}`).then(r => r.json()).then(setStudent);
  }

  async function addTraining(staffId: number) {
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, student_id: parseInt(id) }),
    });
    setShowStaff(false);
    fetch(`/api/students/${id}`).then(r => r.json()).then(setStudent);
  }

  async function removeTraining(staffId: number) {
    await fetch(`/api/training?staffId=${staffId}&studentId=${id}`, { method: "DELETE" });
    fetch(`/api/students/${id}`).then(r => r.json()).then(setStudent);
  }

  if (!student) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const trainedIds = new Set(student.trainedStaff.map(t => t.staff_id));
  const availableStaff = allStaff.filter(s => s.active && !trainedIds.has(s.id));

  return (
    <div>
      <Link href="/students" className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4">
        <ArrowLeft size={16} /> Back to Students
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Student Profile</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input name="name" defaultValue={student.name} required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={!!student.active} className="rounded" />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="requires_swim_support" defaultChecked={!!student.requires_swim_support} className="rounded" />
                Requires Swim Support
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea name="notes" defaultValue={student.notes ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">Save Changes</button>
          </form>
        </div>

        <div className="space-y-6">
          {/* Trained Staff */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Approved Staff</h3>
              {availableStaff.length > 0 && (
                <button onClick={() => setShowStaff(true)} className="text-blue-600 hover:text-blue-800">
                  <Plus size={16} />
                </button>
              )}
            </div>
            {student.trainedStaff.length === 0 ? (
              <p className="text-sm text-gray-500">No staff assigned</p>
            ) : (
              <div className="space-y-2">
                {student.trainedStaff.map(t => (
                  <div key={t.staff_id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span>{t.staff_name}</span>
                      {t.can_cover_swim ? <Badge variant="info">Swim</Badge> : null}
                      {t.can_work_overnight ? <Badge variant="default">ON</Badge> : null}
                    </div>
                    <button onClick={() => removeTraining(t.staff_id)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shift Templates */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-sm font-semibold mb-3">Recurring Shift Templates</h3>
            {student.templates.length === 0 ? (
              <p className="text-sm text-gray-500">No templates</p>
            ) : (
              <div className="space-y-1">
                {student.templates.map(t => (
                  <div key={t.id} className="text-sm flex items-center gap-2">
                    <span className="font-medium w-10">{SHORT_DAYS[t.day_of_week]}</span>
                    <span className="text-gray-600">{t.start_time}-{t.end_time}</span>
                    {t.shift_type === "overnight" && <Badge variant="default">ON</Badge>}
                    {t.needs_swim_support ? <Badge variant="info">Swim</Badge> : null}
                    <span className="text-gray-400 capitalize">{t.activity_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={showStaff} onClose={() => setShowStaff(false)} title="Add Trained Staff">
        <div className="space-y-2">
          {availableStaff.map(s => (
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
