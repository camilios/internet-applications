
import { InventoryServiceLogic } from '../services/inventory-service';
import * as grpc from '@grpc/grpc-js';

type GrpcCallback = grpc.sendUnaryData<any>;

function sendInternalError(
  callback: GrpcCallback,
  operation: string,
  error: unknown
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${operation} error:`, message);

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
  return {
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
      } catch (error: unknown) {
        sendInternalError(callback, 'GetStock', error);
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
      } catch (error: unknown) {
        sendInternalError(callback, 'ReserveStock', error);
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
      } catch (error: unknown) {
        sendInternalError(callback, 'ReleaseStock', error);
      }
    },
  };
}

export const inventoryHandlers = createInventoryHandlers(
  new InventoryServiceLogic()
);
