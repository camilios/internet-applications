import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { config } from './config';
import { inventoryHandlers } from './grpc/handlers';

const PROTO_PATH = path.resolve(__dirname, '../../proto/inventory.proto');

export function createServer(): grpc.Server {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
  const inventoryProto = protoDescriptor.inventory;

  const server = new grpc.Server();
  server.addService(inventoryProto.InventoryService.service, inventoryHandlers);

  return server;
}

export function startServer(): Promise<grpc.Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const address = `0.0.0.0:${config.grpc.port}`;

    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) {
        console.error('Failed to start gRPC server:', err);
        reject(err);
        return;
      }
      console.log(`gRPC Inventory Service running on port ${port}`);
      resolve(server);
    });
  });
}

// Start server if this is the main module
if (require.main === module) {
  startServer().catch(console.error);
}
