import { createHash, randomUUID } from 'crypto';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';

export interface StockInfo {
  productId: number;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  found: boolean;
}

export interface ReserveItem {
  productId: number;
  quantity: number;
}

export interface ReserveItemResult {
  productId: number;
  requestedQuantity: number;
  availableQuantity: number;
  sufficient: boolean;
}

export interface ReservationResult {
  success: boolean;
  reservationId: string;
  failureReason: string;
  itemResults: ReserveItemResult[];
}

export interface ReleaseResult {
  success: boolean;
  message: string;
}

interface InventoryRow extends RowDataPacket {
  product_id: number | string;
  total_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

interface ReservationRow extends RowDataPacket {
  reservation_id: string;
  status: string;
  request_hash: string;
}

interface ReservationItemRow extends RowDataPacket {
  product_id: number | string;
  quantity: number;
}

interface LockRow extends RowDataPacket {
  acquired: number | null;
}

const MAX_LOCK_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 25;

function isRetryableLockError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as { code?: string; errno?: number; message?: string };
  return (
    err.code === 'ER_LOCK_DEADLOCK' ||
    err.errno === 1213 ||
    err.code === 'ER_LOCK_WAIT_TIMEOUT' ||
    err.errno === 1205 ||
    (typeof err.message === 'string' &&
      (err.message.includes('Deadlock found') ||
        err.message.includes('Lock wait timeout exceeded')))
  );
}

export class InventoryServiceLogic {
  async getStock(productId: number): Promise<StockInfo> {
    const [rows] = await getPool().execute<InventoryRow[]>(
      `SELECT product_id, total_quantity, reserved_quantity,
        (total_quantity - reserved_quantity) AS available_quantity
       FROM inventory_items WHERE product_id = ?`,
      [productId]
    );

    if (rows.length === 0) {
      return { productId, totalQuantity: 0, reservedQuantity: 0, availableQuantity: 0, found: false };
    }

    const row = rows[0];
    return {
      productId: Number(row.product_id),
      totalQuantity: row.total_quantity,
      reservedQuantity: row.reserved_quantity,
      availableQuantity: row.available_quantity,
      found: true,
    };
  }

  async reserveStock(items: ReserveItem[], idempotencyKey: string): Promise<ReservationResult> {
    if (!idempotencyKey || items.length === 0 || items.some((item) =>
      !Number.isSafeInteger(item.productId) || item.productId <= 0 ||
      !Number.isSafeInteger(item.quantity) || item.quantity <= 0
    )) {
      return {
        success: false,
        reservationId: '',
        failureReason: 'An idempotency key and positive product quantities are required',
        itemResults: [],
      };
    }

    const sortedItems = [...items]
      .reduce<ReserveItem[]>((aggregated, item) => {
        const existing = aggregated.find((candidate) => candidate.productId === item.productId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          aggregated.push({ ...item });
        }
        return aggregated;
      }, [])
      .sort((a, b) => a.productId - b.productId);
    const requestHash = createHash('sha256')
      .update(JSON.stringify(sortedItems))
      .digest('hex');
    const lockName = `inv_${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 60)}`;

    for (let attempt = 0; attempt <= MAX_LOCK_RETRIES; attempt++) {
      const connection = await getPool().getConnection();
      let lockAcquired = false;
      let transactionStarted = false;

      try {
        const [lockRows] = await connection.execute<LockRow[]>(
          'SELECT GET_LOCK(?, 10) AS acquired',
          [lockName]
        );
        if (Number(lockRows[0]?.acquired) !== 1) {
          throw new Error('Could not acquire the inventory idempotency lock.');
        }
        lockAcquired = true;

        await connection.beginTransaction();
        transactionStarted = true;

        // Note: Do NOT use FOR UPDATE here. When idempotency_key does not exist,
        // FOR UPDATE acquires a gap lock in InnoDB (REPEATABLE READ).
        // Two concurrent requests would each acquire compatible gap locks on the same gap,
        // and subsequently deadlock when both try to insert into reservations.
        const [existingRows] = await connection.execute<ReservationRow[]>(
          'SELECT reservation_id, status, request_hash FROM reservations WHERE idempotency_key = ?',
          [idempotencyKey]
        );

        if (existingRows.length > 0) {
          const existing = existingRows[0];
          await connection.commit();
          transactionStarted = false;

          if (existing.request_hash !== requestHash) {
            return {
              success: false,
              reservationId: '',
              failureReason: 'Idempotency key was already used with a different request',
              itemResults: [],
            };
          }
          if (existing.status === 'confirmed') {
            return {
              success: true,
              reservationId: existing.reservation_id,
              failureReason: '',
              itemResults: [],
            };
          }

          return {
            success: false,
            reservationId: '',
            failureReason: 'Idempotency key has already been used',
            itemResults: [],
          };
        }

        const itemResults: ReserveItemResult[] = [];
        let allSufficient = true;

        for (const item of sortedItems) {
          const [rows] = await connection.execute<InventoryRow[]>(
            `SELECT product_id, total_quantity, reserved_quantity,
              (total_quantity - reserved_quantity) AS available_quantity
             FROM inventory_items WHERE product_id = ? FOR UPDATE`,
            [item.productId]
          );

          const row = rows[0];
          const available = row ? row.available_quantity : 0;
          const sufficient = available >= item.quantity;
          itemResults.push({
            productId: item.productId,
            requestedQuantity: item.quantity,
            availableQuantity: available,
            sufficient,
          });
          allSufficient = allSufficient && sufficient;
        }

        if (!allSufficient) {
          await connection.rollback();
          transactionStarted = false;
          return {
            success: false,
            reservationId: '',
            failureReason: 'Insufficient stock for one or more products',
            itemResults,
          };
        }

        const reservationId = randomUUID();
        await connection.execute(
          'INSERT INTO reservations (reservation_id, idempotency_key, status, request_hash) VALUES (?, ?, ?, ?)',
          [reservationId, idempotencyKey, 'confirmed', requestHash]
        );

        for (const item of sortedItems) {
          const [updateResult] = await connection.execute(
            `UPDATE inventory_items
             SET reserved_quantity = reserved_quantity + ?, updated_at = CURRENT_TIMESTAMP(6)
             WHERE product_id = ? AND (total_quantity - reserved_quantity) >= ?`,
            [item.quantity, item.productId, item.quantity]
          );

          if (!('affectedRows' in updateResult) || updateResult.affectedRows !== 1) {
            throw new Error(`Stock became unavailable during reservation for product ${item.productId}.`);
          }

          await connection.execute(
            'INSERT INTO reservation_items (reservation_id, product_id, quantity) VALUES (?, ?, ?)',
            [reservationId, item.productId, item.quantity]
          );
        }

        await connection.commit();
        transactionStarted = false;

        return {
          success: true,
          reservationId,
          failureReason: '',
          itemResults,
        };
      } catch (error) {
        if (transactionStarted) {
          try {
            await connection.rollback();
          } catch {
            // Ignore rollback errors if already rolled back by MySQL
          }
          transactionStarted = false;
        }

        if (isRetryableLockError(error) && attempt < MAX_LOCK_RETRIES) {
          const jitter = Math.floor(Math.random() * 20);
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      } finally {
        if (lockAcquired) {
          try {
            await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
          } catch (error) {
            connection.destroy();
          }
        }
        connection.release();
      }
    }

    throw new Error('Failed to reserve stock: max retries exceeded.');
  }

  async releaseStock(reservationId: string): Promise<ReleaseResult> {
    for (let attempt = 0; attempt <= MAX_LOCK_RETRIES; attempt++) {
      const connection = await getPool().getConnection();
      let transactionStarted = false;

      try {
        await connection.beginTransaction();
        transactionStarted = true;

        const [reservations] = await connection.execute<ReservationRow[]>(
          'SELECT reservation_id, status, request_hash FROM reservations WHERE reservation_id = ? FOR UPDATE',
          [reservationId]
        );

        if (reservations.length === 0) {
          await connection.rollback();
          transactionStarted = false;
          return { success: false, message: 'Reservation not found' };
        }

        if (reservations[0].status === 'released') {
          await connection.commit();
          transactionStarted = false;
          return { success: true, message: 'Reservation already released (idempotent)' };
        }

        if (reservations[0].status === 'expired') {
          await connection.rollback();
          transactionStarted = false;
          return { success: false, message: 'Reservation has expired' };
        }

        const [items] = await connection.execute<ReservationItemRow[]>(
          'SELECT product_id, quantity FROM reservation_items WHERE reservation_id = ? ORDER BY product_id',
          [reservationId]
        );

        for (const item of items) {
          const [updateResult] = await connection.execute(
            `UPDATE inventory_items
             SET reserved_quantity = reserved_quantity - ?, updated_at = CURRENT_TIMESTAMP(6)
             WHERE product_id = ? AND reserved_quantity >= ?`,
            [item.quantity, item.product_id, item.quantity]
          );
          if (!('affectedRows' in updateResult) || updateResult.affectedRows !== 1) {
            throw new Error(`Could not release reserved quantity for product ${item.product_id}.`);
          }
        }

        await connection.execute(
          'UPDATE reservations SET status = ? WHERE reservation_id = ?',
          ['released', reservationId]
        );
        await connection.commit();
        transactionStarted = false;

        return { success: true, message: 'Stock released successfully' };
      } catch (error) {
        if (transactionStarted) {
          try {
            await connection.rollback();
          } catch {
            // Ignore rollback errors
          }
          transactionStarted = false;
        }

        if (isRetryableLockError(error) && attempt < MAX_LOCK_RETRIES) {
          const jitter = Math.floor(Math.random() * 20);
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      } finally {
        connection.release();
      }
    }

    throw new Error('Failed to release stock: max retries exceeded.');
  }
}
