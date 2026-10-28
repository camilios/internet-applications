
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { existsSync } from 'fs';
import path from 'path';
import { getInventoryTestDatabaseConfig } from '../config';
import { closePool, getPool, verifyInventoryTestDatabase } from '../database/pool';
import { migrate } from '../database/migrate';
import { createInventoryHandlers } from '../grpc/handlers';
import { InventoryServiceLogic } from './inventory-service';

let service: InventoryServiceLogic;
let mysqlTestConfig: ReturnType<typeof getInventoryTestDatabaseConfig>;
let grpcServer: grpc.Server;
let grpcClient: any;
let firstLostResponseCommitted: (() => void) | undefined;
let firstLostResponse: Promise<void>;
let dropNextReserveResponse = false;
let safeTestDatabaseSelected = false;

function reserveOverGrpc(
  request: {
    items: Array<{ product_id: number; quantity: number }>;
    idempotency_key: string;
  },
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    grpcClient.ReserveStock(
      request,
      new grpc.Metadata(),
      { deadline: new Date(Date.now() + timeoutMs) },
      (error: grpc.ServiceError | null, response: any) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(response);
      }
    );
  });
}

beforeAll(async () => {
  mysqlTestConfig = getInventoryTestDatabaseConfig();

  await verifyInventoryTestDatabase(mysqlTestConfig);
  safeTestDatabaseSelected = true;

  await migrate(mysqlTestConfig);

  service = new InventoryServiceLogic();

  const pool = getPool(mysqlTestConfig);

  await pool.execute(
    "DELETE FROM reservations WHERE idempotency_key LIKE 'mysql-test-%'"
  );

  await pool.execute(
    'DELETE FROM inventory_items WHERE product_id IN (1001, 1002, 1003, 1004)'
  );

  await pool.execute(
    `INSERT INTO inventory_items
      (product_id, total_quantity, reserved_quantity)
     VALUES
      (1001, 50, 0),
      (1002, 30, 0),
      (1003, 5, 0),
      (1004, 1, 0)`
  );

  const repositoryProtoPath = path.resolve(
    __dirname,
    '../../../proto/inventory.proto'
  );

  const imageProtoPath = path.resolve(
    __dirname,
    '../../proto/inventory.proto'
  );

  const packageDefinition = protoLoader.loadSync(
    existsSync(repositoryProtoPath)
      ? repositoryProtoPath
      : imageProtoPath,
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    }
  );

  const inventoryProto = (
    grpc.loadPackageDefinition(packageDefinition) as any
  ).inventory;

  const handlers = createInventoryHandlers(service);

  firstLostResponse = new Promise<void>((resolve) => {
    firstLostResponseCommitted = resolve;
  });

  const testHandlers = {
    ...handlers,

    ReserveStock: (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>
    ) =>
      handlers.ReserveStock(call, (error, response) => {
        if (!error && dropNextReserveResponse) {
          dropNextReserveResponse = false;
          firstLostResponseCommitted?.();
          return;
        }

        callback(error, response);
      }),
  };

  grpcServer = new grpc.Server();

  grpcServer.addService(
    inventoryProto.InventoryService.service,
    testHandlers
  );

  const port = await new Promise<number>((resolve, reject) => {
    grpcServer.bindAsync(
      '127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(boundPort);
      }
    );
  });

  const Client = grpc.makeGenericClientConstructor(
    inventoryProto.InventoryService.service,
    'InventoryService'
  );

  grpcClient = new Client(
    `127.0.0.1:${port}`,
    grpc.credentials.createInsecure()
  );
});

afterAll(async () => {
  if (grpcClient) {
    grpcClient.close();
  }

  if (grpcServer) {
    await new Promise<void>((resolve) => {
      grpcServer.tryShutdown(() => resolve());
    });
  }

  if (safeTestDatabaseSelected && mysqlTestConfig) {
    const pool = getPool(mysqlTestConfig);

    await pool.execute(
      "DELETE FROM reservations WHERE idempotency_key LIKE 'mysql-test-%'"
    );

    await pool.execute(
      'DELETE FROM inventory_items WHERE product_id IN (1001, 1002, 1003, 1004)'
    );
  }

  await closePool();
});

describe('InventoryServiceLogic on isolated MySQL and real gRPC', () => {
  it('returns stock for an existing product and not-found for a missing product', async () => {
    await expect(service.getStock(1001)).resolves.toMatchObject({
      productId: 1001,
      totalQuantity: 50,
      reservedQuantity: 0,
      availableQuantity: 50,
      found: true,
    });

    await expect(service.getStock(999999)).resolves.toMatchObject({
      productId: 999999,
      availableQuantity: 0,
      found: false,
    });
  });

  it('reserves multiple products atomically and rolls back when any item is short', async () => {
    const success = await service.reserveStock(
      [
        { productId: 1001, quantity: 2 },
        { productId: 1002, quantity: 3 },
      ],
      'mysql-test-multi-success'
    );

    expect(success.success).toBe(true);

    const before = await service.getStock(1001);

    const failure = await service.reserveStock(
      [
        { productId: 1001, quantity: 1 },
        { productId: 1003, quantity: 100 },
      ],
      'mysql-test-multi-failure'
    );

    expect(failure.success).toBe(false);

    expect(
      (await service.getStock(1001)).reservedQuantity
    ).toBe(before.reservedQuantity);
  });

  it('returns one reservation for repeated idempotency keys', async () => {
    const key = 'mysql-test-idempotent';

    const first = await service.reserveStock(
      [{ productId: 1002, quantity: 1 }],
      key
    );

    const second = await service.reserveStock(
      [{ productId: 1002, quantity: 1 }],
      key
    );

    expect(first.success).toBe(true);

    expect(second).toMatchObject({
      success: true,
      reservationId: first.reservationId,
    });
  });

  it('succeeds only once when two concurrent requests compete for the last unit', async () => {
    const results = await Promise.all([
      service.reserveStock(
        [{ productId: 1004, quantity: 1 }],
        'mysql-test-race-1'
      ),
      service.reserveStock(
        [{ productId: 1004, quantity: 1 }],
        'mysql-test-race-2'
      ),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toHaveLength(1);

    await expect(service.getStock(1004)).resolves.toMatchObject({
      reservedQuantity: 1,
      availableQuantity: 0,
    });
  });

  it('allows releasing a reservation repeatedly without double-releasing stock', async () => {
    const reserved = await service.reserveStock(
      [{ productId: 1002, quantity: 2 }],
      'mysql-test-double-release'
    );

    expect(reserved.success).toBe(true);

    await expect(
      service.releaseStock(reserved.reservationId)
    ).resolves.toMatchObject({
      success: true,
    });

    await expect(
      service.releaseStock(reserved.reservationId)
    ).resolves.toMatchObject({
      success: true,
      message: expect.stringContaining('already released'),
    });

    await expect(service.getStock(1002)).resolves.toMatchObject({
      reservedQuantity: 4,
      availableQuantity: 26,
    });
  });

  it('recovers the committed reservation after the gRPC response is lost', async () => {
    const request = {
      items: [{ product_id: 1003, quantity: 1 }],
      idempotency_key: 'mysql-test-lost-response',
    };

    dropNextReserveResponse = true;

    const timedOutRequest = reserveOverGrpc(request, 300);

    await firstLostResponse;

    await expect(timedOutRequest).rejects.toMatchObject({
      code: grpc.status.DEADLINE_EXCEEDED,
    });

    const retry = await reserveOverGrpc(request);

    expect(retry.success).toBe(true);
    expect(retry.reservation_id).toBeTruthy();

    await expect(service.getStock(1003)).resolves.toMatchObject({
      reservedQuantity: 1,
      availableQuantity: 4,
    });
  });
});
