// Tiny element builder: h("button", { class: "primary", onClick }, "Save").
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key.startsWith("on")) element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") element.className = value;
    else if (key === "value") element.value = value;
    else if (key === "checked") element.checked = value;
    else element.setAttribute(key, value === true ? "" : value);
  }
  element.append(...children.flat(Infinity).filter((child) => child != null && child !== false));
  return element;
}

let uid = 0;
export const nextId = (prefix) => `${prefix}-${++uid}`;
