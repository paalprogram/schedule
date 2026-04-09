"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useStaff() {
  return useSWR("/api/staff", fetcher);
}

export function useStudents() {
  return useSWR("/api/students", fetcher);
}

export function useSchedule(weekStart: string, weekEnd: string) {
  return useSWR(
    weekStart && weekEnd ? `/api/schedule?weekStart=${weekStart}&weekEnd=${weekEnd}` : null,
    fetcher
  );
}

export function useShiftCandidates(shiftId: number | null) {
  return useSWR(
    shiftId ? `/api/shifts/${shiftId}/candidates` : null,
    fetcher
  );
}

export function useCallouts(weekStart?: string, weekEnd?: string, resolved?: boolean) {
  const params = new URLSearchParams();
  if (weekStart) params.set("weekStart", weekStart);
  if (weekEnd) params.set("weekEnd", weekEnd);
  if (resolved !== undefined) params.set("resolved", String(resolved));
  return useSWR(`/api/callouts?${params.toString()}`, fetcher);
}

export function useReports(weekStart: string, weekEnd: string) {
  return useSWR(
    weekStart && weekEnd ? `/api/reports?weekStart=${weekStart}&weekEnd=${weekEnd}` : null,
    fetcher
  );
}
