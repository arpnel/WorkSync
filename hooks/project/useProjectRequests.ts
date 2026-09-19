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
  const load = React.useCallback(async (quiet = false, force = true) => {
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
    }
  }, []);
  React.useEffect(() => {
    void load(false, false);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true, false);
    };
    // Read saved results only; polling never requests a Gemini evaluation.
    const timer = window.setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
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
