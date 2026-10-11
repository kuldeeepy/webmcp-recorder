// Wraps fetch and XMLHttpRequest so we can see what the page sends to its server.
import { separateSecrets } from "./secrets.js";

const NOISE = /google-analytics|googletagmanager|doubleclick|segment\.(io|com)|sentry|hotjar|clarity\.ms|facebook\.com\/tr|mixpanel|amplitude|posthog|\.(png|jpe?g|gif|svg|webp|ico|css|woff2?|js|map)(\?|$)/i;
const MAX_RESPONSE = 2000;

export const nativeFetch = window.fetch.bind(window);

const headersToObject = (headers) =>
  headers instanceof Headers || Array.isArray(headers) ? Object.fromEntries(headers) : { ...(headers || {}) };

const bodyToText = (body) =>
  typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : null;

export function installNetworkCapture({ isRecording, onRequest }) {
  function report({ method, url, headers, body, status, response }) {
    const absolute = new URL(url, location.href);
    if (method === "OPTIONS" || NOISE.test(absolute.href)) return;
    const { safe, secretHeaders } = separateSecrets(absolute.origin, headers);
    if (!isRecording()) return;
    onRequest({ method, url: absolute.href, headers: safe, secretHeaders, body, status, response: response.slice(0, MAX_RESPONSE), at: Date.now() });
  }

  window.fetch = async function (input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = (init.method || request?.method || "GET").toUpperCase();
    const headers = { ...headersToObject(request?.headers), ...headersToObject(init.headers) };
    let body = bodyToText(init.body);
    if (body === null && request && method !== "GET" && isRecording()) body = await request.clone().text().catch(() => null);

    const response = await nativeFetch(input, init);
    const text = isRecording() ? await response.clone().text().catch(() => "") : "";
    try { report({ method, url: request?.url ?? String(input), headers, body, status: response.status, response: text }); } catch {}
    return response;
  };

  const proto = XMLHttpRequest.prototype;
  const { open, setRequestHeader, send } = proto;
  proto.open = function (method, url) {
    this.__wmr = { method: String(method).toUpperCase(), url: String(url), headers: {} };
    return open.apply(this, arguments);
  };
  proto.setRequestHeader = function (name, value) {
    if (this.__wmr) this.__wmr.headers[name] = value;
    return setRequestHeader.apply(this, arguments);
  };
  proto.send = function (body) {
    const meta = this.__wmr;
    if (meta) {
      this.addEventListener("loadend", () => {
        const text = this.responseType === "" || this.responseType === "text" ? this.responseText : "";
        try { report({ ...meta, body: bodyToText(body), status: this.status, response: text }); } catch {}
      });
    }
    return send.apply(this, arguments);
  };
}
