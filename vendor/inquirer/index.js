export function prompt() {
  return Promise.resolve({});
}

export function createPromptModule() {
  return prompt;
}

export const Separator = function Separator() {};

export default { prompt, createPromptModule };
