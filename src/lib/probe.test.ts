import { it, expect } from "vitest";
it("probe", async () => {
  const m = await import("@/routes/api/public/hooks/ia-fila-envio");
  console.log(Object.keys(m));
  const r: any = m.Route;
  console.log(Object.keys(r), typeof r.options, JSON.stringify(Object.keys(r.options ?? {})));
  console.log(typeof r.options?.server?.handlers?.POST);
  expect(1).toBe(1);
});
