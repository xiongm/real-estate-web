export const getApiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_BASE;
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
};
