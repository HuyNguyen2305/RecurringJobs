import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export const requestContext = {
  run(store, callback) {
    return storage.run(store, callback);
  },
  enterWith(store) {
    storage.enterWith(store);
  },
  get(key) {
    const store = storage.getStore();
    return store ? store[key] : undefined;
  },
  set(key, value) {
    const store = storage.getStore();
    if (store) {
      store[key] = value;
    }
  },
};
