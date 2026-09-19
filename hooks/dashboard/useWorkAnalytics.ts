"use client";
import { useEffect, useState } from "react";
import {
  getDashboardProjects,
  type DashboardActivity,
} from "@/services/dashboard/dashboardService";
import { getProjectPayment } from "@/services/payments/paymentService";
import type { PaymentMap } from "@/lib/workAnalytics";
export function useWorkAnalytics() {
  const [data, setData] = useState<DashboardActivity | null>(null);
  const [payments, setPayments] = useState<PaymentMap>({});
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const projects = await getDashboardProjects();
        const result = { projects, listings: [], notifications: [] };
        if (!alive) return;
        setData(result);
        const queue = result.projects.filter((p) => p.projectId);
        const next: PaymentMap = {};
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, queue.length) }, async () => {
            while (alive && cursor < queue.length) {
              const project = queue[cursor++];
              try {
                next[project.id] = await getProjectPayment(project.projectId!);
              } catch {
                next[project.id] = { status: "unavailable" };
              }
            }
          }),
        );
        if (alive) {
          setPayments(next);
          setPaymentLoading(false);
        }
      } catch (cause) {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load analytics.",
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = () => {
    setError("");
    setPaymentLoading(true);
    setAttempt((value) => value + 1);
  };
  return { data, payments, paymentLoading, error, retry };
}
