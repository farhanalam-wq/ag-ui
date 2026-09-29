/**
 * ag-ui embed loader — floating agent chatbot for any website.
 *
 * Usage (paste after ingestion):
 *   <script src="https://chat.example.com/embed.js"
 *     data-widget-key="agw_..."
 *     data-api-base="https://api.example.com"
 *     data-title="Acme Help"
 *     data-color="#3b82f6"></script>
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

  function setTooltip(text) {
    if (orb) orb.setAttribute("title", text);
  }

  function iframeSrc() {
    var q =
      "api=" + encodeURIComponent(apiBase) +
      "&title=" + encodeURIComponent(title) +
      "&color=" + encodeURIComponent(color);
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

  var srcLoaded = false;
  orb.addEventListener("click", function () {
    if (orb.disabled) return;
    if (frame.hidden && !srcLoaded) {
      frame.src = iframeSrc();
      srcLoaded = true;
    }
    frame.hidden = !frame.hidden;
  });

  document.body.appendChild(orb);
  document.body.appendChild(frame);

  // --- Readiness / brand pre-check (best-effort, never blocks render) -------
  if (!widgetKey) return;
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
      var primary =
        (cfg.brand && cfg.brand.tokens && cfg.brand.tokens.colors && cfg.brand.tokens.colors.primary) ||
        color;
      orb.style.background = primary;
      if (!dataset.title && cfg.name) setTooltip("Chat with " + cfg.name);
      else if (cfg.name) setTooltip(title + " — " + cfg.name);
      if (!cfg.ready) setTooltip("Indexing " + (cfg.domain || "knowledge") + "…");
    })
    .catch(function () {
      /* offline — orb still opens the iframe, which shows its own error card */
    });
})();
