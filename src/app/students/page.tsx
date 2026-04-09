"use client";
import { useState } from "react";
import { useStudents, useStaff } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Plus, Edit2, Droplets } from "lucide-react";
import Link from "next/link";

export default function StudentsPage() {
  const { data: students, mutate } = useStudents();
  const { data: staff } = useStaff();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const trainedIds = form.getAll("trained_staff").map(Number);
    await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        requires_swim_support: form.get("requires_swim_support") === "on",
        notes: form.get("notes") || null,
        trained_staff_ids: trainedIds,
      }),
    });
    mutate();
    setShowAdd(false);
    toast("Student added");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} /> Add Student
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Swim Support</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trained Staff</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Notes</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {students?.map((s: Record<string, unknown>) => (
              <tr key={s.id as number} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.name as string}</td>
                <td className="px-4 py-3">
                  {s.requires_swim_support ? (
                    <Badge variant="info"><Droplets size={12} className="mr-1" />Yes</Badge>
                  ) : (
                    <span className="text-sm text-gray-400">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {(s.trained_staff_ids as string)
                    ? (s.trained_staff_ids as string).split(",").length + " staff"
                    : "0 staff"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{(s.notes as string) || "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={s.active ? "success" : "default"}>
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/students/${s.id}`} className="text-blue-600 hover:text-blue-800">
                    <Edit2 size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!students || students.length === 0) && (
          <div className="text-center py-8 text-gray-500">No students yet.</div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Student" wide>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requires_swim_support" className="rounded" />
            Requires Swim Support
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea name="notes" className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          {staff && staff.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trained/Approved Staff</label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {staff.filter((s: Record<string, unknown>) => s.active).map((s: Record<string, unknown>) => (
                  <label key={s.id as number} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="trained_staff" value={s.id as number} className="rounded" />
                    {s.name as string}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add Student</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
