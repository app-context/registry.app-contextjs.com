const { registry } = APP;

export async function index() {
  const list = await registry.list();

  return list.map((item) => ({
    ...item,
    module: item.name,
    name: item.name.replace(/^app-context-/, '')
  }));
}
