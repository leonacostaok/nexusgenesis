import { BootstrapAgentNetwork } from './BootstrapAgentNetwork.js';

export async function bootstrap() {
  const network = new BootstrapAgentNetwork();
  await network.initialize();

  const httpPort = process.env.PORT || network.config.nodes.genesis.httpPort || 19890;
  await network.startHttpServer(httpPort);

  network.start();
  return network;
}

export { BootstrapAgentNetwork } from './BootstrapAgentNetwork.js';
export * from './crypto.js';