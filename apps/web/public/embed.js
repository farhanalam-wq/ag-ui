/**
 * ag-ui embed loader — floating agent chatbot for any website.
 *
 * Usage (paste after ingestion):
 *   <script src="https://chat.example.com/embed.js"
 *     data-widget-key="agw_..."
 *     data-api-base="https://api.example.com"
 *     data-title="Acme Help"
 *     data-color="#3b82f6" defer></script>
 *
 * All network identity is the opaque widget key (`agw_…`); no company ids
 * ever appear in the snippet, the iframe URL, or API paths.
 * Vanilla JS, zero dependencies, <8KB. Safe to include once per page.
 */
(function () {
  "use strict";

  if (window.__agUiEmbedLoaded) return;
  window.__agUiEmbedLoaded = true;

  var ORB_SIZE = 56;
  var PANEL_W = 400;
  var PANEL_H = 600;
  var MARGIN = 20;

  function currentScriptEl() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute("src") || "";
      if (src.indexOf("embed.js") !== -1) return scripts[i];
    }
    return null;
  }

  function scriptOrigin(el) {
    try {
      var src = el && el.getAttribute("src");
      if (src) return new URL(src, window.location.href).origin;
    } catch (e) {
      /* fall through */
    }
    return window.location.origin;
  }

  var scriptEl = currentScriptEl();
  var dataset = (scriptEl && scriptEl.dataset) || {};
  var widgetKey = dataset.widgetKey || "";
  var webOrigin = scriptOrigin(scriptEl);
  var apiBase = (dataset.apiBase || webOrigin).replace(/\/$/, "");
  var title = dataset.title || "Assistant";
  var color = dataset.color || "#2563eb";
  var position = dataset.position === "bottom-left" ? "bottom-left" : "bottom-right";
  var side = position === "bottom-left" ? "left" : "right";

  // --- Cookieless conversation identity -------------------------------------
  // Computed unconditionally, independent of `data-track`: chat answers and
  // their ratings are product data, and the studio resolves the visit context
  // through these ids. The session id is per-tab (sessionStorage); the visitor
  // id persists across tabs (localStorage). Both are random and opaque — no
  // fingerprinting, no IP, nothing identifying.
  var SESSION_KEY = "ag_sess";
  var VISITOR_KEY = "ag_visitor";

  function newEventId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (e) {
      /* fall through */
    }
    return "ag-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  var sessionId;
  try {
    sessionId = window.sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = newEventId();
      window.sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (e) {
    sessionId = newEventId();
  }

  var visitorId;
  try {
    visitorId = window.localStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId = newEventId();
      window.localStorage.setItem(VISITOR_KEY, visitorId);
    }
  } catch (e) {
    visitorId = newEventId();
  }

  function setTooltip(text) {
    if (orb) orb.setAttribute("title", text);
  }

  // Sanitizers mirror packages/shared widget-theme guards (vanilla copy:
  // this file ships standalone with zero dependencies).
  function isHex(v) {
    return typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  }

  function isRadius(v) {
    return typeof v === "string" && /^(0|(?:\d+(?:\.\d+)?)(?:px|rem|%))$/.test(v.trim());
  }

  function iframeSrc() {
    var q =
      "api=" + encodeURIComponent(apiBase) +
      "&title=" + encodeURIComponent(title) +
      "&color=" + encodeURIComponent(color);
    // Shell pair from the last /config theme (set by applyOrbTheme): lets a
    // light brand first-paint on the right surface instead of flashing dark.
    if (themeSurface && themeText) {
      q += "&surface=" + encodeURIComponent(themeSurface) + "&text=" + encodeURIComponent(themeText);
    }
    // Visit identity for the conversation row (chat + ratings). This is the
    // product data path, so it rides along no matter how `data-track` is set.
    q += "&sh=" + encodeURIComponent(sessionId) + "&vh=" + encodeURIComponent(visitorId);
    return webOrigin + "/embed/" + encodeURIComponent(widgetKey) + "?" + q;
  }

  // --- Orb button -----------------------------------------------------------
  var orb = document.createElement("button");
  orb.id = "ag-ui-orb";
  orb.type = "button";
  orb.setAttribute("aria-label", "Open chat assistant");
  orb.setAttribute("title", title);
  orb.style.cssText =
    "position:fixed;" + side + ":" + MARGIN + "px;bottom:" + MARGIN + "px;" +
    "width:" + ORB_SIZE + "px;height:" + ORB_SIZE + "px;border-radius:9999px;" +
    "border:none;cursor:pointer;z-index:2147483000;" +
    "background:" + color + ";color:#fff;font-size:24px;line-height:1;" +
    "box-shadow:0 8px 30px rgba(0,0,0,.35);";
  orb.textContent = "✦";

  if (!widgetKey) {
    orb.disabled = true;
    orb.style.opacity = "0.5";
    orb.setAttribute("title", "Assistant offline — missing widget key");
  }

  // --- Chat panel (lazy iframe) ---------------------------------------------
  var frame = document.createElement("iframe");
  frame.id = "ag-ui-frame";
  frame.setAttribute("title", title);
  frame.hidden = true;
  frame.style.cssText =
    "position:fixed;" + side + ":" + MARGIN + "px;bottom:" + (MARGIN + ORB_SIZE + 12) + "px;" +
    "width:min(" + PANEL_W + "px,calc(100vw - 32px));" +
    "height:min(" + PANEL_H + "px,calc(100dvh - 140px));" +
    "border:1px solid #27272a;border-radius:16px;z-index:2147483000;" +
    "box-shadow:0 24px 70px rgba(0,0,0,.5);background:#09090b;";
  // Allow the embedded app's own scripts while keeping host isolation.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
  // Voice: the iframe needs microphone permission or getUserMedia is denied
  // inside the panel. Host page must be HTTPS (or localhost) for mic access.
  frame.setAttribute("allow", "microphone; autoplay");

  var srcLoaded = false;
  var orbThemeVersion = null;
  var orbFetchedAt = 0;
  var ORB_STALE_MS = 5 * 60 * 1000;
  // Last known good shell pair from /config (hex-only; applicability was
  // already contrast-gated server-side via bodySurface).
  var themeSurface = null;
  var themeText = null;

  function applyOrbTheme(cfg) {
    if (!cfg) return;
    var tokens = (cfg.brand && cfg.brand.tokens) || {};
    var colors = tokens.colors || {};
    var primary = isHex(colors.primary) ? colors.primary : color;
    var secondary = isHex(colors.secondary || colors.accent) ? (colors.secondary || colors.accent) : primary;
    var radius = isRadius(tokens.radius) ? tokens.radius : null;
    orb.style.background = primary;
    if (radius) orb.style.borderRadius = radius;
    orb.onmouseenter = function () {
      orb.style.background = secondary;
    };
    orb.onmouseleave = function () {
      orb.style.background = primary;
    };
    var logoUrl = cfg.brand && cfg.brand.logoUrl;
    if (typeof logoUrl === "string" && /^https:\/\//.test(logoUrl)) {
      var img = document.createElement("img");
      img.src = logoUrl;
      img.alt = "";
      img.style.cssText = "width:60%;height:60%;object-fit:contain;";
      img.onerror = function () {
        img.remove();
      };
      orb.textContent = "";
      orb.appendChild(img);
      orb.style.display = "inline-flex";
      orb.style.alignItems = "center";
      orb.style.justifyContent = "center";
    }

    // Shell pair for the chat panel: forwarded into the iframe via
    // ?surface=&text= for first paint, and applied to the frame element
    // itself so the pre-load letterbox matches instead of staying black.
    var th = (cfg && cfg.theme) || {};
    var bodyOk = th.bodySurface !== undefined ? th.bodySurface : th.fullSurface;
    var surf = isHex(th.surface) ? th.surface.trim().toLowerCase() : null;
    var txt = isHex(th.text) ? th.text.trim().toLowerCase() : null;
    if (bodyOk && surf && txt) {
      themeSurface = surf;
      themeText = txt;
      frame.style.background = surf;
      var frameBorder = isHex(th.secondary)
        ? th.secondary.trim().toLowerCase()
        : (isHex(colors.primary) ? colors.primary.trim().toLowerCase() : null);
      if (frameBorder) frame.style.borderColor = frameBorder;
    }
  }

  function fetchConfig() {
    if (!widgetKey) return Promise.resolve(null);
    return fetch(apiBase + "/api/embed/" + encodeURIComponent(widgetKey) + "/config")
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (cfg) {
        if (cfg) {
          orbFetchedAt = Date.now();
          orbThemeVersion = cfg.themeVersion || null;
        }
        return cfg;
      })
      .catch(function () {
        return null;
      });
  }

  // Agent-panel analytics. The parent owns the panel, so it owns open/close
  // timing and the turn count. initTracking() replaces these no-ops when
  // tracking is enabled, so the widget behaves identically when it is off.
  var chatTracking = {
    open: function () {},
    message: function () {},
    close: function () {},
  };

  orb.addEventListener("click", function () {
    if (orb.disabled) return;
    if (frame.hidden && !srcLoaded) {
      frame.src = iframeSrc();
      srcLoaded = true;
    }
    // Re-theme on open when the cached config is stale (>5 min): picks up
    // re-crawls without a page reload. Best-effort, never blocks the panel.
    if (widgetKey && Date.now() - orbFetchedAt > ORB_STALE_MS) {
      fetchConfig().then(applyOrbTheme);
    }
    var opening = frame.hidden;
    frame.hidden = !frame.hidden;
    // Re-send the host path on every open: the visitor may have navigated
    // while the panel was closed (SPA route change without an iframe reload).
    if (opening) postHostContext();
    if (opening) chatTracking.open();
    else chatTracking.close();
  });

  document.body.appendChild(orb);
  document.body.appendChild(frame);

  // --- Host page context for the panel --------------------------------------
  // The chat iframe is cross-origin, so it cannot read the host path. The
  // conversation stores the page it started on (Agent -> Quality: which pages
  // the agent can answer from), so the parent forwards the path it already
  // knows. The panel treats it as untrusted and the API normalises it with the
  // same rule as the collector; it never contains anything the visitor said.
  function postHostContext() {
    try {
      if (!frame || !frame.contentWindow) return;
      var path = "/";
      try {
        path = window.location.pathname || "/";
      } catch (e) {
        /* opaque origin */
      }
      frame.contentWindow.postMessage(
        { type: "ag-ui/context", path: String(path).slice(0, 1024) },
        "*"
      );
    } catch (e) {
      /* no frame yet */
    }
  }

  frame.addEventListener("load", postHostContext);
  window.addEventListener("popstate", postHostContext);

  // SPA route changes: the panel can stay mounted while the host page changes.
  // Independent of data-track, because the conversation path is product data,
  // not traffic analytics.
  ["pushState", "replaceState"].forEach(function (method) {
    try {
      var original = history[method];
      history[method] = function () {
        var result = original.apply(history, arguments);
        window.setTimeout(postHostContext, 0);
        return result;
      };
    } catch (e) {
      /* frozen history */
    }
  });

  // --- Cookieless traffic tracking (opt-in via data-track="on") -------------
  // ~1KB, zero dependencies. Pageviews (incl. SPA route changes) and
  // data-ag-convert clicks beacon to POST /api/embed/:key/track.
  // Identity stays server-side: the snippet only carries the random opaque
  // session/visitor ids computed above; hashing/salting happens at the
  // collector edge. Respects DNT both ways (skips here, collector drops
  // regardless).
  try {
    if (trackEnabled() && widgetKey) initTracking();
  } catch (e) {
    /* tracking must never break the widget */
  }

  function trackEnabled() {
    if (dataset.track !== "on") return false;
    try {
      if (navigator.doNotTrack === "1") return false;
    } catch (e) {
      /* fall through */
    }
    return true;
  }

  function initTracking() {
    // sessionId and newEventId() are computed up top (unconditional); this
    // function only contributes the beacon plumbing.

    function viewport() {
      try {
        return window.innerWidth + "x" + window.innerHeight;
      } catch (e) {
        return "";
      }
    }

    // The visitor's timezone, as an IANA zone ("Europe/Berlin"). The
    // collector resolves it to an offset, so "3pm" means 3pm where the
    // visitor is. The zone is a claim about the clock, not an identity:
    // nothing here identifies anyone.
    function timezone() {
      try {
        return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").slice(0, 64);
      } catch (e) {
        return "";
      }
    }

    function send(type, extra) {
      var payload = {
        event_id: newEventId(),
        type: type,
        url: String(window.location.href).slice(0, 2048),
        referrer: String(document.referrer || "").slice(0, 2048),
        viewport: viewport(),
        user_agent: String(navigator.userAgent || "").slice(0, 300),
        session_hash: sessionId,
        tz: timezone(),
      };
      if (extra) {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
        }
      }
      var body;
      try {
        body = JSON.stringify(payload);
      } catch (e) {
        return;
      }
      var endpoint = apiBase + "/api/embed/" + encodeURIComponent(widgetKey) + "/track";
      try {
        if (navigator.sendBeacon) {
          var blob = new Blob([body], { type: "application/json" });
          if (navigator.sendBeacon(endpoint, blob)) return;
        }
      } catch (e) {
        /* fall through to fetch */
      }
      try {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
          // Tracking is anonymous (key in URL, no cookies): never send
          // credentials, so a wildcard ACAO can never block us either.
          credentials: "omit",
        }).catch(function () {});
      } catch (e) {
        /* fire-and-forget */
      }
    }

    var lastTrackedUrl = null;
    var pageviewSent = false;
    var scrollFired = {};

    // --- Agent events reported by our own iframe ----------------------------
    // The panel is a cross-origin iframe, so it cannot see the host page path.
    // It sends counts over postMessage and the parent emits the event here,
    // with the real page context (url, referrer, viewport, tz). The iframe
    // never emits analytics itself, and never sends anything the visitor said.
    var AGENT_EVENTS = ["voice_start", "voice_end", "chat_message"];
    // Server-side caps (events.ts -> voice/chat meta builders); mirrored so a
    // runaway tab cannot post an absurd value even before validation.
    var MAX_AGENT_DURATION_SEC = 14400;
    var MAX_AGENT_TURNS = 500;

    function intInRange(v, min, max) {
      var n = typeof v === "number" ? v : Number(v);
      if (!isFinite(n)) return min;
      n = Math.round(n);
      if (n < min) return min;
      if (n > max) return max;
      return n;
    }

    // --- Text chat: the panel's own events ---------------------------------
    // chat_open → a turn per message → chat_close with the panel's duration.
    // Counts only: the question text never leaves the iframe.
    var panelOpen = false;
    var panelOpenedAt = 0;
    var panelTurns = 0;

    function chatOpen() {
      if (panelOpen) return;
      panelOpen = true;
      panelOpenedAt = Date.now();
      panelTurns = 0;
      send("chat_open", { meta: { turns: 0 } });
    }

    function chatMessage() {
      if (!panelOpen) return;
      panelTurns = Math.min(MAX_AGENT_TURNS, panelTurns + 1);
      send("chat_message", { meta: { turns: panelTurns } });
    }

    function chatClose() {
      if (!panelOpen) return;
      panelOpen = false;
      send("chat_close", {
        meta: {
          durationSec: intInRange(
            (Date.now() - panelOpenedAt) / 1000,
            0,
            MAX_AGENT_DURATION_SEC
          ),
          turns: panelTurns,
        },
      });
    }

    chatTracking.open = chatOpen;
    chatTracking.message = chatMessage;
    chatTracking.close = chatClose;

    // A panel still open when the tab goes away is a close, not a lost session.
    window.addEventListener("pagehide", chatClose);

    window.addEventListener("message", function (ev) {
      try {
        // Only our own frame, only our own message type.
        if (!frame || !frame.contentWindow || ev.source !== frame.contentWindow) return;
        var d = ev.data;
        if (!d) return;
        // The panel asks once on mount (and again after a host route change it
        // missed). Answer with the current host path.
        if (d.type === "ag-ui/context-request") {
          postHostContext();
          return;
        }
        if (d.type !== "ag-ui/agent-event") return;
        var name = typeof d.event === "string" ? d.event : "";
        if (AGENT_EVENTS.indexOf(name) === -1) return;
        if (name === "chat_message") {
          // The iframe says a message went out; the parent counts the turn
          // and emits the event with the host context.
          chatMessage();
          return;
        }
        var extra = {};
        if (name === "voice_end") {
          // Rebuilt field by field: nothing from the iframe is trusted as-is.
          // Abandonment is not reported — the collector derives it from turns.
          extra.meta = {
            durationSec: intInRange(d.durationSec, 0, MAX_AGENT_DURATION_SEC),
            turns: intInRange(d.turns, 0, MAX_AGENT_TURNS),
          };
        }
        send(name, extra);
      } catch (e) {
        /* a malformed agent event must never break the page */
      }
    });

    function trackPageview() {
      var href = String(window.location.href);
      if (href === lastTrackedUrl) return;
      lastTrackedUrl = href;
      pageviewSent = true;
      scrollFired = {};
      var title = "";
      try {
        title = String(document.title || "").slice(0, 128);
      } catch (e) {
        /* fall through */
      }
      send("pageview", title ? { meta: { title: title } } : undefined);
    }

    function trackVisiblePageview() {
      if (document.visibilityState === "visible") {
        trackPageview();
      } else {
        var onVis = function () {
          if (document.visibilityState === "visible") {
            document.removeEventListener("visibilitychange", onVis);
            trackPageview();
          }
        };
        document.addEventListener("visibilitychange", onVis);
      }
    }

    trackVisiblePageview();

    // SPA route changes (history API + back/forward).
    function wrapHistory(fnName) {
      try {
        var orig = window.history[fnName];
        if (!orig) return;
        window.history[fnName] = function () {
          var r = orig.apply(this, arguments);
          window.setTimeout(trackPageview, 0);
          return r;
        };
      } catch (e) {
        /* fall through */
      }
    }
    wrapHistory("pushState");
    wrapHistory("replaceState");
    window.addEventListener("popstate", function () {
      window.setTimeout(trackPageview, 0);
    });

    // Unload flush: only if nothing was sent yet (avoids double count).
    window.addEventListener("pagehide", function () {
      if (!pageviewSent) trackPageview();
    });

    // B2C conversions: <button data-ag-convert data-value="49.99">Buy</button>.
    // Configured clicks: any [data-ag-click="name"]. File downloads (anchor
    // download attr or file extension) beacon as download with the href.
    var FILE_EXT = /\.(pdf|zip|csv|xlsx?|pptx?|docx?|txt|mp3|mp4|dmg|exe)$/i;
    document.addEventListener("click", function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest("[data-ag-convert]") : null;
      if (el) {
        var extra = {};
        var v = el.getAttribute("data-value");
        if (v !== null && v !== "") extra.value = v;
        var name = el.getAttribute("data-convert-name");
        if (name) extra.meta = { name: name.slice(0, 64) };
        send("conversion", extra);
        return;
      }
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-ag-click],a,button") : null;
      if (!t) return;
      var cn = t.getAttribute ? t.getAttribute("data-ag-click") : null;
      if (cn) {
        send("click", { meta: { name: String(cn).slice(0, 64) } });
        return;
      }
      if (t.tagName === "A") {
        var href = t.getAttribute("href") || "";
        if (t.hasAttribute("download") || FILE_EXT.test(href.split(/[?#]/)[0])) {
          send("download", { meta: { href: href.slice(0, 512) } });
        }
      }
    });

    // Scroll depth: fire once per threshold per page (25/50/75/90).
    var scrollTick = false;
    function checkScroll() {
      scrollTick = false;
      var depth = 0;
      try {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        depth = h > 0 ? (window.scrollY + window.innerHeight) / (h + window.innerHeight) : 1;
      } catch (e) {
        return;
      }
      var marks = [0.25, 0.5, 0.75, 0.9];
      for (var i = 0; i < marks.length; i++) {
        if (depth >= marks[i] && !scrollFired[marks[i]]) {
          scrollFired[marks[i]] = true;
          send("scroll", { meta: { depth: Math.round(marks[i] * 100) } });
        }
      }
    }
    window.addEventListener(
      "scroll",
      function () {
        lastActive = Date.now();
        if (!scrollTick) {
          scrollTick = true;
          if (window.requestAnimationFrame) window.requestAnimationFrame(checkScroll);
          else window.setTimeout(checkScroll, 200);
        }
      },
      { passive: true }
    );

    // Heartbeat: every 15s while visible and recently active. Volume guard:
    // beacon only (no fetch retry storm), and the worker batches writes.
    var lastActive = Date.now();
    function markActive() {
      lastActive = Date.now();
    }
    window.addEventListener("mousemove", markActive, { passive: true });
    window.addEventListener("keydown", markActive);
    // Touch devices never fire mousemove, so a tap is the only sign of life
    // (M-06). Passive: this must never delay a scroll or a tap.
    window.addEventListener("touchstart", markActive, { passive: true });
    window.addEventListener("pointerdown", markActive, { passive: true });
    window.setInterval(function () {
      try {
        if (document.visibilityState === "visible" && Date.now() - lastActive < 30000) {
          send("heartbeat");
        }
      } catch (e) {
        /* fire-and-forget */
      }
    }, 15000);

    // Custom events: __agUiTrack("conversion", { value: 49.99 }).
    window.__agUiTrack = function (type, extra) {
      if (type !== "pageview" && type !== "conversion" && type !== "scroll" && type !== "download" && type !== "click" && type !== "heartbeat") return;
      send(type, extra || {});
    };
  }

  // --- Readiness / brand pre-check (best-effort, never blocks render) -------  if (!widgetKey) return;
  fetch(apiBase + "/api/embed/" + encodeURIComponent(widgetKey) + "/config")
    .then(function (res) {
      if (res.status === 404) {
        orb.disabled = true;
        orb.style.opacity = "0.5";
        setTooltip("Assistant offline");
        return null;
      }
      if (res.status === 410) {
        orb.disabled = true;
        orb.style.opacity = "0.5";
        setTooltip("This assistant was disabled");
        return null;
      }
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (cfg) {
      if (!cfg) return;
      orbFetchedAt = Date.now();
      orbThemeVersion = cfg.themeVersion || null;
      applyOrbTheme(cfg);
      if (!dataset.title && cfg.name) setTooltip("Chat with " + cfg.name);
      else if (cfg.name) setTooltip(title + " — " + cfg.name);
      if (!cfg.ready) setTooltip("Indexing " + (cfg.domain || "knowledge") + "…");
    })
    .catch(function () {
      /* offline — orb still opens the iframe, which shows its own error card */
    });
})();
