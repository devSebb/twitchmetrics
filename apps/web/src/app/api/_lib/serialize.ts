export function serializeBigInt<T>(value: T): T {
  const serialized = JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;

  return serialized;
}
