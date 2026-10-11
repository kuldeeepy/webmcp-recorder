export const snakeCase = (text) =>
  String(text)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "value";

export const humanize = (text) => {
  const words = snakeCase(text).replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// Loose key for matching spreadsheet headers to field labels ("GST rate (%)" ≈ "gst_rate").
export const looseKey = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
