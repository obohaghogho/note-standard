/**
 * Snowflake-style 64-bit time-sortable ID generator
 * Generates chronologically sortable, globally unique IDs without DB round-trips.
 * Structure: 41 bits timestamp | 10 bits worker/device ID | 12 bits sequence number
 */

const EPOCH = 1735689600000; // Custom Epoch (Jan 1, 2025 00:00:00 UTC)
let lastTimestamp = -1;
let sequence = 0;
const workerId = Math.floor(Math.random() * 1024); // 10-bit worker ID (0-1023)

export function generateSnowflakeId(): string {
  let now = Date.now();

  if (now < lastTimestamp) {
    // Clock moved backwards, fallback to lastTimestamp
    now = lastTimestamp;
  }

  if (now === lastTimestamp) {
    sequence = (sequence + 1) & 4095; // 12-bit sequence (0-4095)
    if (sequence === 0) {
      // Sequence exhausted, wait until next millisecond
      while (now <= lastTimestamp) {
        now = Date.now();
      }
    }
  } else {
    sequence = 0;
  }

  lastTimestamp = now;

  const timePart = BigInt(now - EPOCH) << 22n;
  const workerPart = BigInt(workerId) << 12n;
  const seqPart = BigInt(sequence);

  const snowflakeBigInt = timePart | workerPart | seqPart;
  return snowflakeBigInt.toString();
}

/**
 * Helper to extract creation timestamp (in ms) from a Snowflake ID
 */
export function getSnowflakeTimestamp(snowflakeId: string): number {
  try {
    const bigIntId = BigInt(snowflakeId);
    const timeOffset = Number(bigIntId >> 22n);
    return EPOCH + timeOffset;
  } catch {
    return Date.now();
  }
}
