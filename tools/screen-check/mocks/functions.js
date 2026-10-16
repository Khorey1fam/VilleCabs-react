export const getFunctions = () => ({});
export const httpsCallable = (f, name) => async (data) => {
  window.__calls.push([name, data]);
  const h = (window.__callables || {})[name];
  if (h) return { data: await h(data) };
  return { data: { ok: true } };
};
window.__calls = window.__calls || [];
