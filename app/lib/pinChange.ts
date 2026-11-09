export interface PinChangePayload {
  currentPin: string;
  newPin: string;
  confirmPin: string;
}

interface StationMember {
  id: string;
  role: string;
  active: boolean;
}

export function parsePinChangePayload(value: unknown): PinChangePayload | null {
  if (!value || typeof value !== "object") return null;

  const payload = value as Record<string, unknown>;
  const { currentPin, newPin, confirmPin } = payload;
  if (
    typeof currentPin !== "string" ||
    !/^\d{4,6}$/.test(currentPin) ||
    typeof newPin !== "string" ||
    !/^\d{4,6}$/.test(newPin) ||
    typeof confirmPin !== "string" ||
    !/^\d{4,6}$/.test(confirmPin) ||
    newPin !== confirmPin ||
    newPin === currentPin
  ) {
    return null;
  }

  return { currentPin, newPin, confirmPin };
}

export function isActiveStationOwner(
  attendants: readonly StationMember[],
  attendantId: string
): boolean {
  return attendants.some(
    (attendant) =>
      attendant.id === attendantId &&
      attendant.active &&
      attendant.role === "owner"
  );
}
