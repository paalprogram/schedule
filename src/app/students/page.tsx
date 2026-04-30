"use client";
import { useState, useMemo } from "react";
import { useStudents, useStaff } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Plus, Edit2, Droplets, Search } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import Link from "next/link";

export default function StudentsPage() {
  const { data: students, error: studentsError, mutate } = useStudents();
  const { data: staff } = useStaff();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  const filtered = useMemo(() => {
    if (!students) return [];
    return students.filter((s: Record<string, unknown>) => {
      const nameMatch = !search || (s.name as string).toLowerCase().includes(search.toLowerCase());
      const statusMatch =
        statusFilter === "all" ? true :
        statusFilter === "active" ? !!s.active : !s.active;
      return nameMatch && statusMatch;
    });
  }, [students, search, statusFilter]);

  const archivedCount = useMemo(
    () => (students || []).filter((s: Record<string, unknown>) => !s.active).length,
    [students],
  );

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
        staffing_ratio: parseInt(form.get("staffing_ratio") as string) || 1,
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

      {studentsError && <ErrorBanner message="Failed to load student list." onRetry={() => mutate()} />}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 text-sm">
          {(["active", "archived", "all"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg capitalize ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-white border text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s} {s === "archived" && archivedCount > 0 ? `(${archivedCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Swim</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Ratio</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trained Staff</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: Record<string, unknown>) => (
              <tr key={s.id as number} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{s.name as string}</td>
                <td className="px-4 py-3">
                  {s.requires_swim_support ? <Badge variant="info"><Droplets size={12} className="mr-1" />Yes</Badge> : <span className="text-sm text-gray-400">No</span>}
                </td>
                <td className="px-4 py-3">
                  {(s.staffing_ratio as number) > 1 ? <Badge variant="warning">{s.staffing_ratio as number}:1</Badge> : <span className="text-sm text-gray-400">1:1</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {(s.trained_staff_ids as string) ? (s.trained_staff_ids as string).split(",").length + " staff" : "0 staff"}
                </td>
                <td className="px-4 py-3"><Badge variant={s.active ? "success" : "default"}>{s.active ? "Active" : "Archived"}</Badge></td>
                <td className="px-4 py-3"><Link href={`/students/${s.id}`} className="text-blue-600 hover:text-blue-800"><Edit2 size={16} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-8 text-gray-500">{!students || students.length === 0 ? "No students yet." : "No students match your search."}</div>}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((s: Record<string, unknown>) => (
          <Link key={s.id as number} href={`/students/${s.id}`} className="block bg-white rounded-lg shadow-sm border p-3 active:bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-900">{s.name as string}</span>
              <Badge variant={s.active ? "success" : "default"}>{s.active ? "Active" : "Archived"}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
              {s.requires_swim_support ? <Badge variant="info" className="text-[10px]">Swim</Badge> : null}
              {(s.staffing_ratio as number) > 1 && <Badge variant="warning" className="text-[10px]">{s.staffing_ratio as number}:1</Badge>}
              <span>{(s.trained_staff_ids as string) ? (s.trained_staff_ids as string).split(",").length : 0} trained staff</span>
              {(s.notes as string) && <span className="truncate max-w-[150px]">{s.notes as string}</span>}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div className="text-center py-8 text-gray-500">{!students || students.length === 0 ? "No students yet." : "No students match your search."}</div>}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Student" wide>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requires_swim_support" className="rounded" />
              Requires Swim Support
            </label>
            <div className="flex items-center gap-2 text-sm">
              <label className="font-medium text-gray-700">Staffing Ratio</label>
              <select name="staffing_ratio" className="border rounded-lg px-2 py-1 text-sm">
                <option value="1">1:1</option>
                <option value="2">2:1</option>
              </select>
            </div>
          </div>
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
