// Exposes saved tasks as WebMCP tools so any in-browser agent can call them.

let registration = null;

function schemaFor(task) {
  const properties = {};
  for (const input of task.inputs.filter((i) => i.enabled)) {
    properties[input.id] = {
      type: typeof input.example === "number" ? "number" : "string",
      description: `${input.label} (e.g. ${JSON.stringify(input.example)})`,
      ...(input.options?.length && { enum: input.options.map((o) => o.value) }),
      ...(input.type === "date" && { format: "date" }),
    };
  }
  return { type: "object", properties };
}

export function syncTools(tasks, run) {
  const modelContext = document.modelContext || navigator.modelContext;
  if (!modelContext?.registerTool) return;

  registration?.abort();
  registration = new AbortController();
  for (const task of tasks) {
    modelContext.registerTool({
      name: task.name,
      description: `${task.title} on ${task.host}.${task.risky ? " Changes data on the site." : ""}`,
      inputSchema: schemaFor(task),
      annotations: { readOnlyHint: !task.risky },
      execute: async (args) => {
        const result = await run(task, args);
        return { content: [{ type: "text", text: `${result.ok ? "OK" : "Failed"} (HTTP ${result.status}): ${result.message}\n${result.body.slice(0, 3000)}` }] };
      },
    }, { signal: registration.signal }).catch((error) => console.warn("[WebMCP Recorder] could not register", task.name, error));
  }
}
