(() => {
function createMutation(id, config) {
  return { id, ...config };
}

function applyMutationLabel(mutation, labels) {
  return Object.assign(mutation, labels[mutation.id]);
}

globalThis.CellMutationRegistry = {
  createMutation,
  applyMutationLabel,
};
})();
