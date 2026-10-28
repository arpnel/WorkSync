"use client";

import {
  readProjectCache,
  clearProjectReadCache,
} from "@/lib/projectReadCache";
import * as React from "react";
import {
  getProjectRequests,
  rejectProjectRequest,
  startProjectDiscussion,
  type ProjectRequest,
  type ProjectRequestData,
} from "@/services/project/projectRequestService";

const empty: ProjectRequestData = { received: [], sent: [], discussions: [] };

export function useProjectRequests() {
  const [requests, setRequests] = React.useState(empty);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const loadVersion = React.useRef(0);
  const inFlight = React.useRef(false);
  const refreshAfterCurrent = React.useRef(false);
  const load = React.useCallback(async (quiet = false, force = true) => {
    if (inFlight.current) {
      if (force) refreshAfterCurrent.current = true;
      return;
    }
    inFlight.current = true;
    const version = ++loadVersion.current;
    try {
      if (!quiet) setLoading(true);
      const fresh = await readProjectCache(
        "requests",
        getProjectRequests,
        force,
      );
      if (version !== loadVersion.current) return;
      setRequests(fresh);
      setError(null);
    } catch (value) {
      if (version !== loadVersion.current || quiet) return;
      setError(
        value instanceof Error ? value.message : "Failed to load requests.",
      );
      setRequests(empty);
    } finally {
      if (version === loadVersion.current) setLoading(false);
      inFlight.current = false;
      if (refreshAfterCurrent.current) {
        refreshAfterCurrent.current = false;
        window.setTimeout(() => void load(true, true), 0);
      }
    }
  }, []);
  React.useEffect(() => {
    void load(false, false);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true, false);
    };
    // Read saved results only; polling never requests a Gemini evaluation.
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const onRoleChanged = () => {
      setRequests(empty);
      void load(false, true);
    };
    window.addEventListener("account-role-changed", onRoleChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("account-role-changed", onRoleChanged);
    };
  }, [load]);
  const reject = async (request: ProjectRequest) => {
    setActionId(request.applicationId);
    try {
      await rejectProjectRequest(request.applicationId);
      clearProjectReadCache();
      await load();
    } finally {
      setActionId(null);
    }
  };
  const startDiscussion = async (request: ProjectRequest) => {
    setActionId(request.applicationId);
    try {
      const id = await startProjectDiscussion(request);
      clearProjectReadCache();
      await load();
      return id;
    } finally {
      setActionId(null);
    }
  };
  return {
    requests,
    loading,
    error,
    actionId,
    reject,
    startDiscussion,
    refetch: load,
  };
}
