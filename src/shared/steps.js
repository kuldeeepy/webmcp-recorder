// How a recorded step reads to a person.
export const describeStep = (step) =>
  step.kind === "field" ? `${step.type === "select" ? "Choose" : "Fill in"} ${step.label}`
    : step.kind === "enter" ? `Press Enter in ${step.label}`
      : step.pick === "first" ? "Click the first result" : `Click “${step.label}”`;
