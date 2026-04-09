"use client";
import { useState, useEffect, use } from "react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ArrowLeft, Plus, Trash2, Edit2 } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import Link from "next/link";
import { SHORT_DAYS } from "@/lib/utils";

interface ShiftTemplate {
  id: number; day_of_week: number; start_time: string; end_time: string;
  shift_type: string; activity_type: string; needs_swim_support: number; notes: string | null;
}

interface StudentDetail {
  id: number; name: string; active: number;
  requires_swim_support: number; notes: string | null;
  trainedStaff: Array<{ staff_id: number; staff_name: string; can_cover_swim: number; can_work_overnight: number }>;
  templates: ShiftTemplate[];
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [allStaff, setAllStaff] = useState<Array<{ id: number; name: string; active: number }>>([]);
  const [showStaff, setShowStaff] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [loadError, setLoadError] = useState(false);

  function reload() {
    setLoadError(false);
    fetch(`/api/students/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setStudent)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    reload();
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
    toast("Student profile saved");
    reload();
  }

  async function addTraining(staffId: number) {
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, student_id: parseInt(id) }),
    });
    setShowStaff(false);
    toast("Training assignment added");
    reload();
  }

  async function removeTraining(staffId: number) {
    if (!await confirm({ message: "Remove this training assignment?", variant: "danger", confirmText: "Remove" })) return;
    await fetch(`/api/training?staffId=${staffId}&studentId=${id}`, { method: "DELETE" });
    toast("Training assignment removed");
    reload();
  }

  async function handleTemplateSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      student_id: parseInt(id),
      day_of_week: parseInt(form.get("day_of_week") as string),
      start_time: form.get("start_time"),
      end_time: form.get("end_time"),
      shift_type: form.get("shift_type"),
      activity_type: form.get("activity_type"),
      needs_swim_support: form.get("needs_swim_support") === "on",
      notes: form.get("notes") || null,
    };

    if (editingTemplate) {
      await fetch(`/api/templates/${editingTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Shift template updated");
    } else {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Shift template created");
    }

    setShowTemplate(false);
    setEditingTemplate(null);
    reload();
  }

  async function deleteTemplate(templateId: number) {
    if (!await confirm({ message: "Delete this shift template?", variant: "danger", confirmText: "Delete" })) return;
    await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
    toast("Shift template deleted");
    reload();
  }

  if (loadError) return (
    <div className="py-8">
      <ErrorBanner message="Failed to load student profile." onRetry={reload} />
    </div>
  );
  if (!student) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const trainedIds = new Set(student.trainedStaff.map(t => t.staff_id));
  const availableStaff = allStaff.filter(s => s.active && !trainedIds.has(s.id));

  return (
    <div>
      <Link href="/students" className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4">
        <ArrowLeft size={16} /> Back to Students
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
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

          {/* Shift Templates - full management */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recurring Shift Templates</h2>
              <button
                onClick={() => { setEditingTemplate(null); setShowTemplate(true); }}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700"
              >
                <Plus size={14} /> Add Template
              </button>
            </div>
            {student.templates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No recurring shift templates. Add templates to auto-generate weekly shifts.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Day</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Activity</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Flags</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {student.templates.map(t => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{SHORT_DAYS[t.day_of_week]}</td>
                      <td className="px-3 py-2 text-gray-600">{t.start_time} - {t.end_time}</td>
                      <td className="px-3 py-2 capitalize">{t.shift_type}</td>
                      <td className="px-3 py-2 capitalize">{t.activity_type}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {t.shift_type === "overnight" && <Badge variant="default">Overnight</Badge>}
                          {t.needs_swim_support ? <Badge variant="info">Swim</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{t.notes || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingTemplate(t); setShowTemplate(true); }}
                            className="text-blue-600 hover:text-blue-800 p-1"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteTemplate(t.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Sidebar */}
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
        </div>
      </div>

      {/* Add/Edit Template Modal */}
      <Modal
        open={showTemplate}
        onClose={() => { setShowTemplate(false); setEditingTemplate(null); }}
        title={editingTemplate ? "Edit Shift Template" : "Add Shift Template"}
      >
        <form onSubmit={handleTemplateSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
            <select name="day_of_week" defaultValue={editingTemplate?.day_of_week ?? 1} className="w-full border rounded-lg px-3 py-2 text-sm">
              {SHORT_DAYS.map((day, i) => (
                <option key={i} value={i}>{day} ({["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][i]})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input name="start_time" type="time" defaultValue={editingTemplate?.start_time ?? "08:00"} required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input name="end_time" type="time" defaultValue={editingTemplate?.end_time ?? "14:00"} required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shift Type</label>
              <select name="shift_type" defaultValue={editingTemplate?.shift_type ?? "regular"} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="regular">Regular</option>
                <option value="overnight">Overnight</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity</label>
              <select name="activity_type" defaultValue={editingTemplate?.activity_type ?? "general"} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="general">General</option>
                <option value="swimming">Swimming</option>
                <option value="community">Community</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="needs_swim_support" defaultChecked={!!editingTemplate?.needs_swim_support} className="rounded" />
            Needs Swim Support
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input name="notes" defaultValue={editingTemplate?.notes ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowTemplate(false); setEditingTemplate(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              {editingTemplate ? "Save Changes" : "Add Template"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Training Modal */}
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
