function noopPrompt() {
  return Promise.resolve({});
}

function prompt() {
  return noopPrompt();
}

function createPromptModule() {
  return prompt;
}

module.exports = {
  prompt,
  createPromptModule,
  Separator: function Separator() {},
  default: { prompt, createPromptModule },
};
