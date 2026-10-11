// Export a site's tasks to a file, and read one back, so one person can set tasks up for a whole team.
const FORMAT = "webmcp-recorder/tasks@1";

export function exportTasks(site) {
  const file = { format: FORMAT, host: site.host, exportedAt: new Date().toISOString(), tasks: site.tasks };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `${site.host}-tasks.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Returns the tasks in the file, or throws a message a person can act on.
export async function readTaskFile(file, host) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error("That file isn't a tasks export."); }
  if (data?.format !== FORMAT || !Array.isArray(data.tasks)) throw new Error("That file isn't a tasks export.");
  if (data.host !== host) throw new Error(`Those tasks are for ${data.host}. Open that site and import them there.`);
  return data.tasks;
}
