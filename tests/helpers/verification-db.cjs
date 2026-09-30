module.exports = function verificationDatabase() {
  const requests = [],
    profiles = [],
    failures = [];
  const db = {
    requests,
    profiles,
    failures,
    from(table) {
      const filters = [];
      let op = "select",
        payload,
        one = false,
        either = false;
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          filters.push((row) => row[key] === value);
          return q;
        },
        or(expression) {
          if (expression.startsWith("verification_status.")) {
            const status = expression.split(".neq.")[1];
            filters.push(
              (row) =>
                row.verification_status == null ||
                row.verification_status !== status,
            );
          } else either = true;
          return q;
        },
        maybeSingle() {
          one = true;
          return q;
        },
        insert(value) {
          op = "insert";
          payload = value;
          return q;
        },
        update(value) {
          op = "update";
          payload = value;
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              const failure = failures.findIndex(
                (f) => f.table === table && f.op === op,
              );
              if (failure >= 0)
                return { data: null, error: failures.splice(failure, 1)[0] };
              const rows =
                table === "verification_requests" ? requests : profiles;
              const matches = (row) =>
                filters.every((f) => f(row)) &&
                (!either || row.is_current || row.status === "pending");
              if (op === "insert") {
                if (
                  rows.some(
                    (row) =>
                      row.provider_session_id === payload.provider_session_id ||
                      (row.user_id === payload.user_id &&
                        ((row.is_current && payload.is_current) ||
                          (row.status === "pending" &&
                            payload.status === "pending"))),
                  )
                )
                  return { data: null, error: { code: "23505" } };
                rows.push({
                  request_id: "request-" + rows.length,
                  verified_at: null,
                  ...payload,
                });
              }
              const found = rows.filter(matches);
              if (op === "update")
                for (const row of found) Object.assign(row, payload);
              return {
                data: one
                  ? found[0]
                    ? { ...found[0] }
                    : null
                  : found.map((r) => ({ ...r })),
                error: null,
              };
            })
            .then(resolve, reject);
        },
      };
      return q;
    },
  };
  return db;
};
