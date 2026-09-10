"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(root + "/js/main.js", "utf8");
async function fixture(locale = "en", query = "") {
  const dom = new JSDOM(
    fs.readFileSync(
      root + (locale === "es" ? "/quote-es.html" : "/quote.html"),
      "utf8",
    ),
    {
      url:
        "http://localhost/" + (locale === "es" ? "quote-es" : "quote") + query,
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
  product: "printed_vinyl",
  vinylUse: "general",
  serviceMode: "",
  collateralProduct: "flyers",
  cutStyle: "rectangular",
  bannerFinish: "recommend",
  paperFinish: "recommend",
  finishingRequest: "both",
  businessRole: "",
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

test("ten visible products have bilingual parity; canonical service taxonomy is unchanged", async () => {
  const a = await fixture(),
    b = await fixture("es");
  const ids = (x) =>
    [...x.d.querySelector("#quoteService").options].map((o) => o.value);
  assert.deepEqual(ids(a), ids(b));
  assert.equal(new Set(ids(a)).size, 10);
  assert.deepEqual(Array.from(a.q.SERVICES, s=>s[0]).sort(), ["wrap_production_only","wholesale_printing","vinyl_large_format_printing","window_graphics","wall_murals","contour_cut_decals","vehicle_wraps","print_collateral","other","cutting_lamination"].sort());
  a.dom.window.close();
  b.dom.window.close();
});
for (const locale of ["en", "es"])
  test(
    locale +
      ": every product renders only its relevant dimensions/vehicle/material/fulfillment controls",
    async () => {
      const f = await fixture(locale);
      for (const s of f.q.PRODUCTS) {
        change(f.w, f.d.querySelector("#quoteService"), s[0]);
        const vehicle = s[0] === "vehicle_wraps";
        assert.equal(f.d.querySelector("#vehicleQuestions").hidden, !vehicle);
        assert.equal(f.d.querySelector("#dimensionQuestions").hidden, vehicle);
        assert.equal(
          f.d.querySelector("#vinylUse").parentElement.hidden,
          s[0] !== "printed_vinyl",
        );
        const values = [...f.d.querySelector("#fulfillment").options].map(
          (o) => o.value,
        );
        if (
          [
            "printed_vinyl",
            "banners",
            "stickers_decals",
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
  change(f.w, f.d.querySelector("#quoteService"), "banners");
  assert.deepEqual(
    [...f.d.querySelector("#material").options].map((o) => o.value),
    ["banner"],
  );
  assert.deepEqual(
    [...f.d.querySelector("#lamination").options].map((o) => o.value),
    ["advise", "matte", "gloss", "none"],
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
          product: "vehicle_wraps",
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
test("frontend payload retains project details and consent in specifications", async () => {
  const f=await fixture();
  for(const [product,service] of Object.entries(expectedRoutes)) {
    const payload=plain(f.q.buildPayload({...draft,product},"en"));
    assert.equal(payload.service,service);
    assert.equal(payload.productionRequest.product,product);
    assert.equal(payload.productionRequest.smsConsent,false);
    assert.ok(payload.message.includes(f.q.PRODUCTS.find(p=>p[0]===product)[1]));
  }
  const paper=f.q.buildPayload({...draft,product:"print_collateral",smsConsent:true},"en");
  assert.equal(paper.productionRequest.vehicle,"");
  assert.equal(paper.productionRequest.zip,"");
  assert.equal(paper.productionRequest.smsConsent,true);
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

const expectedRoutes = {
  printed_vinyl: "vinyl_large_format_printing",
  banners: "vinyl_large_format_printing",
  coroplast: "vinyl_large_format_printing",
  acm: "vinyl_large_format_printing",
  window_graphics: "window_graphics",
  wall_murals: "wall_murals",
  stickers_decals: "contour_cut_decals",
  vehicle_wraps: "vehicle_wraps",
  print_collateral: "print_collateral",
  other: "other",
};
for (const locale of ["en", "es"])
  test(
    locale +
      ": product routing and full product details survive outgoing specifications and readable summary",
    async () => {
      const f = await fixture(locale);
      for (const [product, service] of Object.entries(expectedRoutes)) {
        const d = {
          ...draft,
          product,
          cutStyle: "around_design",
          bannerFinish: "hems_grommets",
          collateralProduct: "menus",
          paperFinish: "hard_laminated",
        };
        const payload = plain(f.q.buildPayload(d, locale));
        assert.equal(payload.service, service);
        assert.equal(payload.productionRequest.product, product);
        assert.ok(
          payload.message.includes(
            f.q.PRODUCTS.find((p) => p[0] === product)[locale === "es" ? 2 : 1],
          ),
        );
      }
      const general = f.q.buildPayload(draft, locale),
        panels = f.q.buildPayload(
          { ...draft, vinylUse: "vehicle_panels" },
          locale,
        );
      assert.equal(general.service, "vinyl_large_format_printing");
      assert.equal(panels.service, "wrap_production_only");
      assert.equal(panels.productionRequest.productDetail, "vehicle_panels");
      for (const role of [
        "business_owner",
        "installer",
        "print_reseller",
        "other",
      ])
        assert.equal(
          f.q.buildPayload({ ...draft, businessRole: role }, locale).service,
          general.service,
        );
      f.dom.window.close();
    },
  );
for (const locale of ["en", "es"])
  test(
    locale +
      ": legacy service/product/project links retain explicit routes and details",
    async () => {
      const links = {
        "vehicle-wrap-panels": ["wrap_production_only", "vehicle_panels"],
        "replacement-wrap-panel": [
          "wrap_production_only",
          "replacement_panels",
        ],
        "fleet-wraps": ["vehicle_wraps", "vehicle_wraps"],
        "vehicle-wrap": ["vehicle_wraps", "vehicle_wraps"],
        wholesale_printing: ["wholesale_printing", "general"],
        "wholesale-vinyl": ["wholesale_printing", "general"],
        wrap_production_only: ["wrap_production_only", "vehicle_panels"],
        "wrap-panels": ["wrap_production_only", "vehicle_panels"],
        "replacement-panels": ["wrap_production_only", "replacement_panels"],
        "vinyl-banners": ["vinyl_large_format_printing", "banners"],
        cutting_lamination: ["cutting_lamination", "both"],
        "ricoh-print": ["print_collateral", "flyers"],
      };
      for (const param of ["service", "product", "project"])
        for (const [link, [service, detail]] of Object.entries(links)) {
          const f = await fixture(locale, "?" + param + "=" + link);
          const state = f.q.resolveLink(
            new f.w.URLSearchParams("?" + param + "=" + link),
          );
          const p = f.q.buildPayload({ ...draft, ...state }, locale);
          assert.equal(p.service, service);
          assert.equal(p.productionRequest.productDetail, detail);
          assert.equal(f.d.querySelector("#quoteService").value, state.product);
          f.dom.window.close();
        }
      const f = await fixture(locale, "?service=unknown");
      f.d.querySelector("#quoteNext").click();
      assert.equal(f.d.querySelector('[data-step="0"]').hidden, false);
      assert.throws(() => f.q.buildPayload({ ...draft, product: "" }, locale));
      f.dom.window.close();
    },
  );
test("finishing secondary route and wholesale exit are explicit; invalid options do not get a fallback", async () => {
  const f = await fixture();
  f.d.querySelector("#finishingService").click();
  assert.equal(f.d.querySelector("#quoteService").parentElement.hidden, true);
  assert.equal(
    f.d.querySelector("#finishingRequest").parentElement.hidden,
    false,
  );
  f.d.querySelector("#returnProducts").click();
  assert.equal(f.d.querySelector("#quoteService").parentElement.hidden, false);
  change(f.w, f.d.querySelector("#quoteService"), "printed_vinyl");
  assert.deepEqual(
    [...f.d.querySelector("#material").options].map((o) => o.value),
    ["vinyl"],
  );
  change(f.w, f.d.querySelector("#quoteService"), "stickers_decals");
  assert.equal(f.d.querySelector("#cutStyle").parentElement.hidden, false);
  assert.ok(
    f.q
      .validate(
        { ...draft, product: "stickers_decals", cutStyle: "unsupported" },
        2,
      )
      .includes("material"),
  );
  change(f.w, f.d.querySelector("#quoteService"), "print_collateral");
  change(f.w, f.d.querySelector("#collateralProduct"), "menus");
  change(f.w, f.d.querySelector("#paperFinish"), "hard_laminated");
  change(f.w, f.d.querySelector("#collateralProduct"), "business_cards");
  assert.equal(f.d.querySelector("#paperFinish").value, "recommend");
  assert.ok(
    f.q
      .validate(
        {
          ...draft,
          product: "print_collateral",
          collateralProduct: "flyers",
          paperFinish: "hard_laminated",
        },
        2,
      )
      .includes("material"),
  );
  f.dom.window.close();
});

for (const locale of ["en", "es"]) test(locale + ": vinyl grade visibility, labels, routing and persistence", async () => {
  const f = await fixture(locale);
  const grade = f.d.querySelector("#vinylGrade");
  assert.deepEqual(Array.from(grade.options, o=>o.value), ["recommend","commercial","premium"]);
  assert.deepEqual(Array.from(grade.options, o=>o.textContent), locale === "en" ? ["Recommend a grade","Commercial","Premium"] : ["Recomiéndenme una opción","Comercial","Premium"]);
  assert.equal(grade.parentElement.hidden, false);
  for (const product of f.q.PRODUCTS.map(p=>p[0])) {
    change(f.w, f.d.querySelector("#quoteService"), product);
    assert.equal(grade.parentElement.hidden, product !== "printed_vinyl");
  }
  change(f.w, f.d.querySelector("#quoteService"), "printed_vinyl");
  change(f.w, grade, "premium");
  assert.match(f.d.querySelector("#reviewDetails").textContent, /Premium/);
  assert.match(f.d.querySelector("#vinylMaterialDetails").textContent, /Avery Dennison.*Aura.*KPMF.*Evolv.*ORACAL.*TeckWrap.*Aluko Vinyl/);
  change(f.w, grade, "commercial");
  assert.match(f.d.querySelector("#vinylGradeHelp").textContent, /General Formulations.*Canvas Escape/);
  assert.match(f.d.querySelector("#vinylMaterialDetails").textContent, /PPF/);
  assert.doesNotMatch(f.d.body.textContent, /54[″"].*164/);
  for (const value of ["recommend","commercial","premium"]) for (const use of ["general","vehicle_panels","replacement_panels"]) {
    const payload=plain(f.q.buildPayload({...draft,vinylUse:use,vinylGrade:value},locale));
    payload.submissionId="local_0123456789abcdef";
    assert.equal(payload.productionRequest.vinylGrade,value);
    assert.equal(payload.service,use==="general"?"vinyl_large_format_printing":"wrap_production_only");
    assert.ok(payload.message.includes(Array.from(grade.options).find(o=>o.value===value).textContent));
    assert.equal(payload.productionRequest.lamination,draft.lamination);
  }
  const wholesale=f.q.buildPayload({...draft,serviceMode:"wholesale_printing",vinylGrade:"premium"},locale);
  assert.equal(wholesale.service,"wholesale_printing"); assert.equal(wholesale.productionRequest.vinylGrade,"premium");
  f.d.querySelector("#finishingService").click(); assert.equal(grade.parentElement.hidden,true);
  assert.equal(f.q.buildPayload({...draft,serviceMode:"cutting_lamination",vinylGrade:"premium"},locale).productionRequest.vinylGrade,"");
  assert.equal(f.q.buildPayload({...draft,product:"banners",vinylGrade:"premium"},locale).productionRequest.vinylGrade,"");
  assert.ok(f.q.validate({...draft,vinylGrade:"unknown"},2).length);
  assert.throws(()=>f.q.buildPayload({...draft,vinylGrade:"unknown"},locale));
  f.dom.window.close();
});

for (const locale of ["en", "es"]) test(locale + ": concise disclosure and product changes clear inapplicable hidden selections", async () => {
  const f = await fixture(locale), get = id => f.d.getElementById(id);
  assert.equal(get("vinylMaterialDetails").open, false);
  assert.equal(get("vinylMaterialDetails").querySelector("summary").textContent, locale === "en" ? "View material details" : "Ver detalles de materiales");
  assert.doesNotMatch(f.d.body.textContent, /Double PR|Liner|described by the shop|descrita por el taller/);
  for (const grade of ["commercial", "premium"]) {
    change(f.w, get("vinylGrade"), grade);
    assert.ok(get("vinylGradeHelp").textContent.length < 155);
    assert.doesNotMatch(get("vinylGradeHelp").textContent, /3M|Avery|PPF/);
  }
  for (const [product, material] of [["printed_vinyl","vinyl"],["stickers_decals","vinyl"],["banners","banner"],["coroplast","coroplast"],["acm","acm"],["wall_murals","wall"],["print_collateral","paper"]]) {
    change(f.w, get("quoteService"), "window_graphics");
    change(f.w, get("material"), "perforated");
    change(f.w, get("quoteService"), product);
    assert.equal(get("material").parentElement.hidden, true);
    assert.equal(get("material").value, material);
    const payload = f.q.buildPayload({...draft, product, material:"perforated", vinylGrade:"premium"}, locale);
    assert.equal(payload.productionRequest.material, material);
    if(product !== "printed_vinyl") {
      assert.equal(get("vinylGrade").value,"recommend");
      assert.equal(get("vinylMaterialDetails").hidden,true);
      assert.equal(payload.productionRequest.vinylGrade,"");
    }
  }
  change(f.w,get("quoteService"),"window_graphics");
  assert.equal(get("material").parentElement.hidden,false);
  change(f.w,get("quoteService"),"printed_vinyl");
  assert.equal(get("vinylGrade").value,"recommend");
  get("finishingService").click();
  assert.equal(get("material").value,"supplied");
  assert.equal(get("material").parentElement.hidden,true);
  assert.equal(get("vinylGrade").parentElement.hidden,true);
  f.dom.window.close();
});
