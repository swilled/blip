(() => {
  const MAX_REPORTS_PER_PAGE = 250;
  const MAX_RECORD_BYTES = 2048;
  let reportsSent = 0;

  function bound(value, depth = 0) {
    if (value == null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return value.slice(0, 256);
    if (depth >= 3) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => bound(item, depth + 1));
    if (typeof value === "object") {
      const result = {};
      for (const [key, item] of Object.entries(value).slice(0, 20)) {
        result[String(key).slice(0, 64)] = bound(item, depth + 1);
      }
      return result;
    }
    return String(value).slice(0, 256);
  }

  function send(name, detail) {
    if (reportsSent >= MAX_REPORTS_PER_PAGE) return;
    reportsSent += 1;

    const record = {
      page: window.location.pathname,
      origin: window.location.origin,
      type: String(name).slice(0, 80),
      detail: bound(detail ?? {}),
      reportedAt: Date.now(),
    };
    let body = JSON.stringify(record);
    if (new TextEncoder().encode(body).byteLength > MAX_RECORD_BYTES) {
      record.detail = { truncated: true };
      body = JSON.stringify(record);
    }

    void fetch("/__report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  }

  window.blipReport = send;

  function targetDescription(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    if (!element) return null;
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      name: "name" in element ? element.name || "" : "",
      type: "type" in element ? element.type || "" : "",
      role: element.getAttribute("role") || "",
    };
  }

  for (const eventName of ["keydown", "keypress", "keyup", "focusin", "focusout", "input", "change", "click", "submit"]) {
    document.addEventListener(eventName, (event) => {
      const detail = { event: eventName, target: targetDescription(event.target) };
      if (eventName === "keydown" || eventName === "keypress" || eventName === "keyup") {
        // Only record the Enter signal; never transmit typed characters or field values.
        detail.enter = event.key === "Enter";
      }
      send("page-event", detail);
    }, true);
  }

  send("page-ready", {});
})();
