
import { InventoryServiceLogic } from '../services/inventory-service';
import * as grpc from '@grpc/grpc-js';
import { randomUUID } from 'crypto';

type GrpcCallback = grpc.sendUnaryData<any>;

function sendInternalError(
  callback: GrpcCallback
): void {
  // The exception may contain SQL bindings. Log the RPC status at the callback boundary instead.

  callback({
    code: grpc.status.INTERNAL,
    message: 'Internal server error',
    name: 'INTERNAL',
    details: 'Internal server error',
    metadata: new grpc.Metadata(),
  });
}

/**
 * Accept either snake_case or camelCase field names.
 * This makes the handler resilient to proto-loader casing settings.
 */
function readField(
  object: Record<string, any> | null | undefined,
  snakeCase: string,
  camelCase: string
): any {
  if (!object) return undefined;

  return object[snakeCase] !== undefined
    ? object[snakeCase]
    : object[camelCase];
}

export function createInventoryHandlers(service: InventoryServiceLogic) {
  const handlers = {
    GetStock: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: GrpcCallback
    ) => {
      try {
        const productId = Number(
          readField(call.request, 'product_id', 'productId')
        );

        if (!Number.isSafeInteger(productId) || productId <= 0) {
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'A valid positive product_id is required',
            name: 'INVALID_ARGUMENT',
            details: 'A valid positive product_id is required',
            metadata: new grpc.Metadata(),
          });
          return;
        }

        const result = await service.getStock(productId);

        callback(null, {
          product_id: result.productId,
          total_quantity: result.totalQuantity,
          reserved_quantity: result.reservedQuantity,
          available_quantity: result.availableQuantity,
          found: result.found,
        });
      } catch {
        sendInternalError(callback);
      }
    },

    ReserveStock: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: GrpcCallback
    ) => {
      try {
        const items = readField(call.request, 'items', 'items');
        const idempotencyKey = readField(
          call.request,
          'idempotency_key',
          'idempotencyKey'
        );

        if (!Array.isArray(items)) {
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'items must be an array',
            name: 'INVALID_ARGUMENT',
            details: 'items must be an array',
            metadata: new grpc.Metadata(),
          });
          return;
        }

        const reserveItems = items.map((item: any) => ({
          productId: Number(
            readField(item, 'product_id', 'productId')
          ),
          quantity: Number(item?.quantity),
        }));



        const result = await service.reserveStock(
          reserveItems,
          typeof idempotencyKey === 'string' ? idempotencyKey : ''
        );

        callback(null, {
          success: result.success,
          reservation_id: result.reservationId,
          failure_reason: result.failureReason,
          item_results: result.itemResults.map((item) => ({
            product_id: item.productId,
            requested_quantity: item.requestedQuantity,
            available_quantity: item.availableQuantity,
            sufficient: item.sufficient,
          })),
        });
      } catch {
        sendInternalError(callback);
      }
    },

    ReleaseStock: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: GrpcCallback
    ) => {
      try {
        const reservationId = readField(
          call.request,
          'reservation_id',
          'reservationId'
        );

        if (
          typeof reservationId !== 'string' ||
          reservationId.trim().length === 0
        ) {
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'A valid reservation_id is required',
            name: 'INVALID_ARGUMENT',
            details: 'A valid reservation_id is required',
            metadata: new grpc.Metadata(),
          });
          return;
        }

        const result = await service.releaseStock(reservationId);

        callback(null, {
          success: result.success,
          message: result.message,
        });
      } catch {
        sendInternalError(callback);
      }
    },
  };
  const traced = (operation: keyof typeof handlers) =>
    (call: grpc.ServerUnaryCall<any, any>, callback: GrpcCallback) => {
      const incoming = call.metadata?.get('x-correlation-id')[0];
      const correlationId = typeof incoming === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incoming)
        ? incoming.toLowerCase() : randomUUID();
      return handlers[operation](call, (error, response) => {
        console.log(JSON.stringify({time: new Date().toISOString(), service: 'inventory',
          message: 'Inventory RPC finished', operation, correlation_id: correlationId,
          status: error?.code ?? grpc.status.OK}));
        callback(error, response);
      });
    };
  return {GetStock: traced('GetStock'), ReserveStock: traced('ReserveStock'), ReleaseStock: traced('ReleaseStock')};
}

export const inventoryHandlers = createInventoryHandlers(
  new InventoryServiceLogic()
);
