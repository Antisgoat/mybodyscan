const MESSAGE =
  "FORBIDDEN in native build: firebase/compat/* (web auth must not ship to iOS).";

throw new Error(MESSAGE);

export {};
