export type SignField = {
  id: string | number;
  type: string;
  required?: boolean;
  page?: number;
  x?: number;
  y?: number;
};

export type FieldValueMap = Record<string, any>;

export function isRequiredField(field: SignField): boolean {
  if (!field) return false;
  return Boolean(field.required) || field.type === 'signature' || field.type === 'initials';
}

export function isFieldComplete(field: SignField, values: FieldValueMap): boolean {
  const meta = values[String(field.id)];
  if (!meta) return false;
  if (field.type === 'checkbox') return meta.value === true;
  return Boolean(meta.value);
}

export function sortFieldOrder(a: SignField, b: SignField): number {
  const pageA = a?.page || 1;
  const pageB = b?.page || 1;
  if (pageA !== pageB) return pageA - pageB;
  const yA = typeof a?.y === 'number' ? a.y : 0;
  const yB = typeof b?.y === 'number' ? b.y : 0;
  if (yA !== yB) return yB - yA;
  const xA = typeof a?.x === 'number' ? a.x : 0;
  const xB = typeof b?.x === 'number' ? b.x : 0;
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
