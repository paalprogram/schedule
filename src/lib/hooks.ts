"use client";
import useSWR from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error("Request failed") as Error & { status: number };
    error.status = res.status;
    try { Object.assign(error, await res.json()); } catch {}
    throw error;
  }
  return res.json();
};

const retryOpts = { errorRetryCount: 3 };

export function useStaff() {
  return useSWR("/api/staff", fetcher, retryOpts);
}

export function useStudents() {
  return useSWR("/api/students", fetcher, retryOpts);
}

export function useSchedule(weekStart: string, weekEnd: string) {
  return useSWR(
    weekStart && weekEnd ? `/api/schedule?weekStart=${weekStart}&weekEnd=${weekEnd}` : null,
    fetcher,
    retryOpts,
  );
}

export function useShiftCandidates(shiftId: number | null) {
  return useSWR(
    shiftId ? `/api/shifts/${shiftId}/candidates` : null,
    fetcher,
    retryOpts,
  );
}

export function useCallouts(weekStart?: string, weekEnd?: string, resolved?: boolean) {
  const params = new URLSearchParams();
  if (weekStart) params.set("weekStart", weekStart);
  if (weekEnd) params.set("weekEnd", weekEnd);
  if (resolved !== undefined) params.set("resolved", String(resolved));
  return useSWR(`/api/callouts?${params.toString()}`, fetcher, retryOpts);
}

export function useReports(weekStart: string, weekEnd: string) {
  return useSWR(
    weekStart && weekEnd ? `/api/reports?weekStart=${weekStart}&weekEnd=${weekEnd}` : null,
    fetcher,
    retryOpts,
  );
}
