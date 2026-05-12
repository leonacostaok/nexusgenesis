export const name = 'hello-world';
export const version = '1.0.0';
export const description = 'A Hello World plugin example for NexusGenesis';
export const dependencies = [];

export const hooks = {
  onInit: async (manager) => {
    console.log('[HelloWorld Plugin] Initialized!');
  },

  onReady: async (manager) => {
    console.log('[HelloWorld Plugin] NexusGenesis is ready!');
  },

  onError: async (manager, error) => {
    console.log(`[HelloWorld Plugin] Error detected:`, error?.message);
  }
};

export function routes(router) {
  router.get('/', (req, res) => {
    res.json({
      success: true,
      plugin: 'hello-world',
      message: 'Hello from NexusGenesis Plugin!',
      timestamp: Date.now()
    });
  });

  router.get('/status', (req, res) => {
    res.json({
      success: true,
      plugin: 'hello-world',
      status: 'running',
      uptime: process.uptime()
    });
  });
}

export default { name, version, description, dependencies, hooks, routes };