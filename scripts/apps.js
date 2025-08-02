class App {
  constructor() {
    this.callHandlers = {};
  }

  registerCallHandler(methodName, handler) {
    this.callHandlers[methodName] = handler;
  }

  async processCall({ type, data, caller, method }) {
    if (!this.callHandlers[method]) throw new Error('Method not found');
    switch (type) {
      case 'ui-less':
        await this.callHandlers[method](data, caller);
        return;
      default:
        throw new Error('Invalid call type');
    }
  }
}

export default App;
