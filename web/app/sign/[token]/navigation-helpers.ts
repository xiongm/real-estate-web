export type SignField = {
  id: string | number;
  type: string;
  required?: boolean;
  page?: number;
  x?: number;
  y?: number;
};

export type FieldValueMap = Record<string, any>;

const Y_TOLERANCE = 10; // points; treat near-aligned rows as the same height

const toNumber = (value: any, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export function isRequiredField(field: SignField): boolean {
  if (!field) return false;
  const navTypes = ['signature', 'initials', 'date', 'datetime'];
  return Boolean(field.required) || navTypes.includes(field.type);
}

export function isFieldComplete(field: SignField, values: FieldValueMap): boolean {
  const meta = values[String(field.id)];
  if (!meta) return false;
  if ((field.type === 'text' || field.type === 'textarea') && meta.committed !== true) {
    return false;
  }
  if ((field.type === 'date' || field.type === 'datetime') && meta.valid === false) {
    return false;
  }
  if (field.type === 'checkbox') return meta.value === true;
  return Boolean(meta.value);
}

export function sortFieldOrder(a: SignField, b: SignField): number {
  const pageA = toNumber(a?.page, 1);
  const pageB = toNumber(b?.page, 1);
  if (pageA !== pageB) return pageA - pageB;
  const yA = toNumber(a?.y, 0);
  const yB = toNumber(b?.y, 0);
  const yDiff = yB - yA;
  if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
  const xA = toNumber(a?.x, 0);
  const xB = toNumber(b?.x, 0);
  return xA - xB;
}

export function nextIncompleteField(
  orderedFields: SignField[],
  values: FieldValueMap,
  currentId?: string | null
): string | null {
  if (!orderedFields.length) return null;
  const startIndex = currentId ? orderedFields.findIndex((f) => String(f.id) === currentId) : -1;
  const searchOrder = [
    ...orderedFields.slice(Math.max(startIndex + 1, 0)),
    ...orderedFields.slice(0, Math.max(startIndex + 1, 0)),
  ];
  const next = searchOrder.find((field) => !isFieldComplete(field, values));
  return next ? String(next.id) : null;
}
