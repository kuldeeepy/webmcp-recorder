// Describes page elements the way a person would ("the Search box", "the Add to cart button") and finds them again.

export const CLICKABLE = 'button, [role="button"], input[type="submit"], input[type="button"], a[href]';
export const FIELD = "input, select, textarea";
const MAX_LABEL = 60;
const TEST_ATTRS = ["data-test", "data-testid", "data-test-id", "data-cy"];
const GENERATED_ID = /\d{3,}|[a-f0-9]{8,}|^:r|^ember|^mui-/i;

export const cleanText = (text) => String(text || "").replace(/\s+/g, " ").replace(/[*:]+$/, "").trim().slice(0, MAX_LABEL);

export const isVisible = (element) => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";

export function fieldLabel(element) {
  const labelledBy = element.getAttribute("aria-labelledby");
  return cleanText(
    element.labels?.[0]?.innerText
      || element.getAttribute("aria-label")
      || (labelledBy && document.getElementById(labelledBy)?.innerText)
      || element.placeholder
      || element.name
      || element.id,
  );
}

// Cards and big links: use their heading ("Thor Hammer"), not every word inside them.
export function clickLabel(element) {
  const own = element.getAttribute("aria-label") || element.value;
  if (own) return cleanText(own);
  const heading = element.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"]');
  return cleanText(heading?.innerText) || cleanText(element.innerText);
}

const testIdOf = (element) => TEST_ATTRS.map((a) => element.getAttribute(a)).find(Boolean) || null;
const stableId = (element) => (element.id && !GENERATED_ID.test(element.id) ? element.id : null);
const signature = (element) => element.tagName.toLowerCase() + [...element.classList].filter((c) => !/^(ng-|is-|active|selected)/.test(c)).map((c) => `.${CSS.escape(c)}`).join("");

// If the element is (inside) one of several look-alike siblings, remember which one: "3rd product card".
function listPosition(element) {
  for (let node = element, depth = 0; node?.parentElement && depth < 6; node = node.parentElement, depth++) {
    const selector = signature(node);
    const peers = [...node.parentElement.children].filter((child) => child.matches(selector));
    if (peers.length >= 3 && selector.includes(".")) {
      return { itemSelector: selector, index: [...document.querySelectorAll(selector)].filter(isVisible).indexOf(node), targetIsItem: node === element };
    }
  }
  return null;
}

export const describe = (element, label) => ({
  tag: element.tagName.toLowerCase(),
  label,
  id: stableId(element),
  name: element.getAttribute("name"),
  testId: testIdOf(element),
  list: listPosition(element),
});

const unique = (selector) => {
  const matches = [...document.querySelectorAll(selector)].filter(isVisible);
  return matches.length === 1 ? matches[0] : null;
};

// Finds the element for a recorded step on the current page, or null if it isn't there (yet).
export function locate(step) {
  const target = step.target;
  if (step.kind === "click" && step.pick === "first" && target.list) {
    const item = [...document.querySelectorAll(target.list.itemSelector)].find(isVisible);
    if (!item) return null;
    return target.list.targetIsItem ? item : item.querySelector(CLICKABLE) || item;
  }
  const attempts = [
    target.testId && TEST_ATTRS.map((attr) => `[${attr}="${CSS.escape(target.testId)}"]`).join(", "),
    target.id && `#${CSS.escape(target.id)}`,
    target.name && `${target.tag}[name="${CSS.escape(target.name)}"]`,
  ].filter(Boolean);
  for (const selector of attempts) {
    const found = unique(selector);
    if (found) return found;
  }
  const pool = step.kind === "click" ? CLICKABLE : FIELD;
  const labelOf = step.kind === "click" ? clickLabel : fieldLabel;
  const candidates = [...document.querySelectorAll(pool)].filter((el) => isVisible(el) && labelOf(el) === target.label);
  return candidates.find((el) => el.tagName.toLowerCase() === target.tag) || candidates[0] || null;
}
