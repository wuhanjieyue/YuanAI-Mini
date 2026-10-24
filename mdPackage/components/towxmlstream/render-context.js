const createTextContext = () => ({
    textRenderCb: { value: undefined },
    textInstaceUuid: { value: undefined },
    curText: { value: '' },
});

const createBatchContext = () => ({
    batchRenderCb: { value: {} },
});

let nextContextId = 0;
const contexts = new Map();

function createContext(events) {
  const id = `towxml-${Date.now().toString(36)}-${nextContextId++}`;
  const context = {
    ...createTextContext(),
    ...createBatchContext(),
  };
  if (events) {
    context.events = events;
    context.eventRefCount = 0;
  }
  contexts.set(id, context);
  return { id, context };
}

function createRenderContext() {
  return createContext();
}

function createEventContext(events) {
  return createContext(events);
}

function getRenderContext(id) {
  return id ? contexts.get(id) : undefined;
}

function destroyRenderContext(id) {
  if (id) {
    contexts.delete(id);
  }
}

function retainRenderContext(id) {
  const context = getRenderContext(id);
  if (context && context.events) {
    context.eventRefCount += 1;
  }
}

function releaseRenderContext(id) {
  const context = getRenderContext(id);
  if (!context || !context.events) return;
  context.eventRefCount -= 1;
  if (context.eventRefCount <= 0) {
    destroyRenderContext(id);
  }
}

module.exports = {
  createRenderContext,
  createEventContext,
  getRenderContext,
  destroyRenderContext,
  retainRenderContext,
  releaseRenderContext,
};
