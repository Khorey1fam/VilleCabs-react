export const getFunctions = () => ({});
export const httpsCallable = (f, name) => async (data) => {
  window.__calls.push([name, data]);
  try { console.log('CALL ' + name + ' ' + JSON.stringify(data)); } catch (e) { /* ignore */ }
  const h = (window.__callables || {})[name];
  if (h) return { data: await h(data) };
  return { data: { ok: true } };
};
window.__calls = window.__calls || [];
