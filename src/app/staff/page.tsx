"use client";
import { useState } from "react";
import { useStaff } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Plus, Edit2, Droplets, Moon } from "lucide-react";
import Link from "next/link";

export default function StaffPage() {
  const { data: staff, mutate } = useStaff();
  const [showAdd, setShowAdd] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        role: form.get("role"),
        can_work_overnight: form.get("can_work_overnight") === "on",
        can_cover_swim: form.get("can_cover_swim") === "on",
        max_hours_per_week: form.get("max_hours_per_week") ? parseInt(form.get("max_hours_per_week") as string) : null,
        notes: form.get("notes") || null,
      }),
    });
    mutate();
    setShowAdd(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} /> Add Staff
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Capabilities</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Max Hrs/Wk</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trained Students</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {staff?.map((s: Record<string, unknown>) => (
              <tr key={s.id as number} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.name as string}</td>
                <td className="px-4 py-3 text-sm text-gray-600 capitalize">{(s.role as string).replace("_", " ")}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {s.can_cover_swim ? (
                      <Badge variant="info"><Droplets size={12} className="mr-1" />Swim</Badge>
                    ) : null}
                    {s.can_work_overnight ? (
                      <Badge variant="default"><Moon size={12} className="mr-1" />Overnight</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{(s.max_hours_per_week as number) || "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {(s.trained_student_ids as string)
                    ? (s.trained_student_ids as string).split(",").length
                    : 0}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={s.active ? "success" : "default"}>
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/staff/${s.id}`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Edit2 size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!staff || staff.length === 0) && (
          <div className="text-center py-8 text-gray-500">No staff members yet.</div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select name="role" className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="direct_care">Direct Care</option>
              <option value="lead">Lead</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="can_cover_swim" className="rounded" />
              Swim Certified
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="can_work_overnight" className="rounded" />
              Overnight Available
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Hours/Week</label>
            <input name="max_hours_per_week" type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Leave blank for no limit" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea name="notes" className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add Staff</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
