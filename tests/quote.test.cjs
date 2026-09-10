"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(root + "/js/main.js", "utf8");
async function fixture(locale = "en") {
  const dom = new JSDOM(
    fs.readFileSync(
      root + (locale === "es" ? "/quote-es.html" : "/quote.html"),
      "utf8",
    ),
    {
      url: "http://localhost/" + (locale === "es" ? "quote-es" : "quote"),
      runScripts: "outside-only",
    },
  );
  await new Promise((r) => dom.window.addEventListener("load", r));
  dom.window.eval(source);
  dom.window.initCanvasQuote();
  return {
    dom,
    w: dom.window,
    q: dom.window.CanvasQuote,
    d: dom.window.document,
  };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const draft = {
  service: "wrap_production_only",
  productDetail: "general",
  measurementHelp: false,
  pieces: [{ width: 24, height: 36, unit: "in", quantity: 2 }],
  vehicle: "2024 Ford Transit",
  vehicleCount: 1,
  coverage: "partial",
  material: "recommend",
  lamination: "advise",
  artwork: "ready",
  fulfillment: "pickup",
  zip: "78753",
  completionDate: "",
  rush: false,
  name: "Local QA Only",
  company: "Example",
  email: "test@example.invalid",
  phone: "+15125550123",
  notes: "Test only",
  smsConsent: false,
  smsConsentText: "Optional SMS permission",
};
function change(w, el, value) {
  if (el.type === "checkbox") el.checked = value;
  else el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}

test("ten documented canonical IDs are identical in English, Spanish, model and adapter", async () => {
  const a = await fixture(),
    b = await fixture("es");
  const ids = (x) =>
    [...x.d.querySelector("#quoteService").options].map((o) => o.value);
  assert.deepEqual(ids(a), ids(b));
  assert.equal(new Set(ids(a)).size, 10);
  const adapter = require("../functions/crm-lead-adapter");
  for (const s of a.q.SERVICES)
    assert.equal(adapter.SERVICE_MAPPING[s[0]], s[1]);
  a.dom.window.close();
  b.dom.window.close();
});
for (const locale of ["en", "es"])
  test(
    locale +
      ": every product renders only its relevant dimensions/vehicle/material/fulfillment controls",
    async () => {
      const f = await fixture(locale);
      for (const s of f.q.SERVICES) {
        change(f.w, f.d.querySelector("#quoteService"), s[0]);
        const vehicle = s[0] === "vehicle_wraps";
        assert.equal(f.d.querySelector("#vehicleQuestions").hidden, !vehicle);
        assert.equal(f.d.querySelector("#dimensionQuestions").hidden, vehicle);
        assert.equal(
          f.d.querySelector("#productDetail").parentElement.hidden,
          s[0] !== "vinyl_large_format_printing",
        );
        const values = [...f.d.querySelector("#fulfillment").options].map(
          (o) => o.value,
        );
        if (
          [
            "wrap_production_only",
            "wholesale_printing",
            "cutting_lamination",
            "print_collateral",
          ].includes(s[0])
        )
          assert.ok(!values.includes("installation"));
      }
      f.dom.window.close();
    },
  );
test("banner and paper products cannot retain unrelated wrap film / laminate selection", async () => {
  const f = await fixture();
  change(
    f.w,
    f.d.querySelector("#quoteService"),
    "vinyl_large_format_printing",
  );
  change(f.w, f.d.querySelector("#productDetail"), "banner");
  assert.deepEqual(
    [...f.d.querySelector("#material").options].map((o) => o.value),
    ["recommend", "banner"],
  );
  assert.deepEqual(
    [...f.d.querySelector("#lamination").options].map((o) => o.value),
    ["advise", "none"],
  );
  change(f.w, f.d.querySelector("#quoteService"), "print_collateral");
  assert.ok(
    ![...f.d.querySelector("#material").options].some(
      (o) => o.value === "wrap",
    ),
  );
  f.dom.window.close();
});
test("finished area uses explicit units, quantity and multiple sizes", async () => {
  const f = await fixture();
  for (const [unit, width, height] of [
    ["in", 12, 12],
    ["ft", 1, 1],
    ["cm", 30.48, 30.48],
    ["mm", 304.8, 304.8],
  ])
    assert.ok(
      Math.abs(f.q.area([{ unit, width, height, quantity: 3 }]) - 3) < 1e-9,
    );
  assert.equal(
    f.q.area([
      { unit: "ft", width: 2, height: 3, quantity: 2 },
      { unit: "in", width: 12, height: 12, quantity: 4 },
    ]),
    16,
  );
  f.dom.window.close();
});
test("dimension validation blocks zeros, negatives, unsupported units and fractional quantity; help bypasses only dimensions", async () => {
  const f = await fixture();
  for (const p of [
    { width: 0 },
    { height: -1 },
    { unit: "yards" },
    { quantity: 1.5 },
    { quantity: 0 },
  ])
    assert.ok(
      f.q
        .validate({ ...draft, pieces: [{ ...draft.pieces[0], ...p }] }, 1)
        .includes("dimensions"),
    );
  assert.equal(
    f.q.validate({ ...draft, measurementHelp: true, pieces: [] }, 1).length,
    0,
  );
  assert.ok(
    f.q
      .validate(
        {
          ...draft,
          service: "vehicle_wraps",
          vehicle: "",
          measurementHelp: true,
        },
        1,
      )
      .includes("vehicle"),
  );
  f.dom.window.close();
});
test("pickup requires no ZIP; delivery and installation validate US ZIP, timing is optional", async () => {
  const f = await fixture();
  assert.equal(f.q.validate({ ...draft, zip: "" }, 3).length, 0);
  assert.ok(
    f.q
      .validate({ ...draft, fulfillment: "shipping", zip: "" }, 3)
      .includes("zip"),
  );
  assert.equal(
    f.q.validate({ ...draft, fulfillment: "shipping", zip: "78753-1234" }, 3)
      .length,
    0,
  );
  assert.ok(
    f.q
      .validate({ ...draft, completionDate: "2000-01-01" }, 3)
      .includes("date"),
  );
  f.dom.window.close();
});
test("progressive validation, measurement help, and default optional SMS consent", async () => {
  const f = await fixture();
  f.d.querySelector("#quoteNext").click();
  assert.equal(f.d.querySelector('[data-step="1"]').hidden, false);
  f.d.querySelector("#quoteNext").click();
  assert.equal(f.d.querySelector("#quoteError").hidden, false);
  change(f.w, f.d.querySelector("#measurementHelp"), true);
  f.d.querySelector("#quoteNext").click();
  assert.equal(f.d.querySelector('[data-step="2"]').hidden, false);
  assert.equal(f.d.querySelector("#smsConsent").checked, false);
  f.dom.window.close();
});
test("payload survives the deployed public allowlist and nested sanitizer without new backend fields", async () => {
  const f = await fixture();
  const runtime = fs.readFileSync(root + "/functions/index.js", "utf8");
  const code = runtime.slice(
    runtime.indexOf("const PUBLIC_LEAD_FIELDS"),
    runtime.indexOf("async function enforcePublicLeadRateLimit"),
  );
  const ctx = { functions: { https: { HttpsError: Error } } };
  vm.createContext(ctx);
  vm.runInContext(code + ";this.validate=validatePublicLead;", ctx);
  for (const s of f.q.SERVICES) {
    const payload = plain(
      f.q.buildPayload({ ...draft, service: s[0] }, "es", {
        now: "2026-09-10T00:00:00Z",
      }),
    );
    payload.submissionId = "local_0123456789abcdef";
    const saved = ctx.validate(payload).lead;
    assert.equal(saved.service, s[0]);
    assert.deepEqual(plain(saved.productionRequest), payload.productionRequest);
    assert.equal(saved.message, payload.message);
    assert.equal(saved.productionRequest.smsConsent, false);
  }
  f.dom.window.close();
});
test("irrelevant values are excluded and summary explicitly carries project details through CRM", async () => {
  const f = await fixture();
  const payload = f.q.buildPayload(
    { ...draft, service: "print_collateral", smsConsent: true },
    "en",
  );
  assert.equal(payload.productionRequest.vehicle, "");
  assert.equal(payload.productionRequest.zip, "");
  const adapter = require("../functions/crm-lead-adapter");
  const mapped = adapter.buildRequestMapping(
    "local_0123456789abcdef",
    plain(payload),
    "2026-09-10T00:00:00Z",
  );
  assert.equal(
    mapped.body.requestedService,
    "Flyers & Business Cards (Secondary)",
  );
  assert.equal(mapped.body.message, payload.message);
  assert.equal(mapped.body.smsConsent, true);
  assert.equal(mapped.body.marketingConsent, false);
  assert.ok(
    mapped.unsupportedFields.some((x) => x.field === "productionRequest"),
  );
  f.dom.window.close();
});
test("no-upload retry reuses identical payload and ID, blocks parallel submits, and retains success", async () => {
  const f = await fixture();
  let calls = [],
    reject;
  const client = {
    uploadLeadFiles() {
      throw Error("unexpected");
    },
    async submitLead(p) {
      calls.push(JSON.stringify(p));
      if (calls.length === 1) await new Promise((r, j) => (reject = j));
      return { ok: true, id: p.submissionId, duplicate: true };
    },
  };
  const flow = f.q.createSubmission(client, () => "local_0123456789abcdef");
  const first = flow.send({ name: "First" }, []);
  assert.equal(await flow.send({ name: "Second" }, []), null);
  reject(Error("lost response"));
  await assert.rejects(first);
  const result = await flow.send({ name: "Changed" }, []);
  assert.equal(calls[0], calls[1]);
  assert.equal(result.id, "local_0123456789abcdef");
  await flow.send({}, []);
  assert.equal(calls.length, 2);
  f.dom.window.close();
});
test("uploaded session ID remains associated across a lost submission response without uploading twice", async () => {
  const f = await fixture();
  let uploads = 0,
    calls = [];
  const flow = f.q.createSubmission(
    {
      async uploadLeadFiles() {
        uploads++;
        return [
          {
            submissionId: "upload_0123456789abcdef",
            path: "lead-uploads/mock/file.png",
          },
        ];
      },
      async submitLead(p) {
        calls.push(plain(p));
        if (calls.length === 1) throw Error("lost response");
        return { ok: true, id: p.submissionId };
      },
    },
    () => "wrong-id",
  );
  const files = [{ name: "file.png", type: "image/png", size: 100 }];
  await assert.rejects(flow.send({ name: "Original" }, files));
  await flow.send({ name: "Edited" }, files);
  assert.equal(uploads, 1);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].submissionId, "upload_0123456789abcdef");
  f.dom.window.close();
});
test("upload failure prevents submission; file validation rejects oversized or unsupported files", async () => {
  const f = await fixture();
  let submissions = 0;
  const flow = f.q.createSubmission(
    {
      async uploadLeadFiles() {
        throw Error("upload unavailable");
      },
      async submitLead() {
        submissions++;
      },
    },
    () => "unused",
  );
  await assert.rejects(
    flow.send({}, [{ name: "a.png", size: 1, type: "image/png" }]),
  );
  assert.equal(submissions, 0);
  for (const files of [
    [{ name: "a.exe", size: 2 }],
    [{ name: "a.png", size: 21 * 1024 * 1024 }],
    Array.from({ length: 11 }, () => ({ name: "a.pdf", size: 1 })),
  ])
    assert.throws(() => f.q.validateFiles(files));
  f.dom.window.close();
});
test("UI shows success only after persistence and uses same payload on retry", async () => {
  const f = await fixture();
  let payloads = [];
  f.w.CanvasFirebase = {
    async uploadLeadFiles() {
      throw Error("unexpected");
    },
    async submitLead(p) {
      payloads.push(JSON.stringify(p));
      if (payloads.length === 1) throw Error("network");
      return { ok: true, id: p.submissionId };
    },
  };
  f.d.querySelector("#quoteNext").click();
  change(f.w, f.d.querySelector("#measurementHelp"), true);
  f.d.querySelector("#quoteNext").click();
  f.d.querySelector("#quoteNext").click();
  f.d.querySelector("#quoteNext").click();
  for (const [id, v] of [
    ["contactName", "Local Test"],
    ["email", "test@example.invalid"],
    ["phone", "5125550123"],
  ])
    f.d.querySelector("#" + id).value = v;
  f.d
    .querySelector("form")
    .dispatchEvent(new f.w.Event("submit", { cancelable: true }));
  await new Promise((r) => setImmediate(r));
  assert.equal(f.d.querySelector("#quoteSuccess").hidden, true);
  assert.equal(f.d.querySelector("#quoteSubmit").disabled, false);
  f.d
    .querySelector("form")
    .dispatchEvent(new f.w.Event("submit", { cancelable: true }));
  await new Promise((r) => setImmediate(r));
  assert.equal(f.d.querySelector("#quoteSuccess").hidden, false);
  assert.equal(payloads[0], payloads[1]);
  f.dom.window.close();
});
