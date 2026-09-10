'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const adapter=require('../crm-lead-adapter');
const expected={vehicle_wraps:'Vehicle Wraps',vinyl_large_format_printing:'Vinyl & Large-Format Printing',window_graphics:'Perforated Window Vinyl / Storefront Glass',wall_murals:'Wall Murals & Interior Vinyl',contour_cut_decals:'Contour-Cut Decals',cutting_lamination:'Cutting & Lamination',print_collateral:'Flyers & Business Cards (Secondary)',wholesale_printing:'Print Partner / Wholesale Vinyl Printing',wrap_production_only:'Wrap Production Only',other:'Other'};
// Historical mapping frozen from reviewed PR #3 at 41b323b91e6af8e26cac08cf2bcc482bf991fa2c.
const legacy={
  "vehicle-wraps": "Vehicle Wraps",
  "vehicle-wrap": "Vehicle Wraps",
  "partial-wrap": "Vehicle Wraps",
  "color-change": "Vehicle Wraps",
  "fleet": "Vehicle Wraps",
  "fleet-wrap": "Vehicle Wraps",
  "van": "Vehicle Wraps",
  "truck": "Vehicle Wraps",
  "box-truck": "Vehicle Wraps",
  "food-truck": "Vehicle Wraps",
  "food-trailer": "Vehicle Wraps",
  "concession-trailer": "Vehicle Wraps",
  "large-format": "Vinyl & Large-Format Printing",
  "Vinyl Print Production": "Vinyl & Large-Format Printing",
  "Print and Ship Vinyl Production": "Vinyl & Large-Format Printing",
  "perforated-window-vinyl": "Perforated Window Vinyl / Storefront Glass",
  "storefront-signage": "Perforated Window Vinyl / Storefront Glass",
  "interior-branding": "Wall Murals & Interior Vinyl",
  "decals": "Contour-Cut Decals",
  "lamination-cutting": "Cutting & Lamination",
  "cutting-only": "Cutting & Lamination",
  "short-run-digital": "Flyers & Business Cards (Secondary)",
  "print-partner": "Print Partner / Wholesale Vinyl Printing",
  "full-service": "Print Partner / Wholesale Vinyl Printing",
  "wrap-production": "Wrap Production Only",
  "other": "Other",
  "General Inquiry": "Other",
  "WhatsApp Inquiry": "Other",
  "Marine and Boat Wraps": "Other",
  "Basic Visibility Package": "Other",
  "Private Feedback": "Other"
};
const source={name:'Local Fixture',email:'fixture@example.invalid',phone:'+15125550199',message:'Vinyl grade: Premium'};
test('all ten canonical website services map to approved labels and preserve the readable summary',()=>{
 for(const [service,label] of Object.entries(expected)){
  const m=adapter.buildRequestMapping('local_mapping_fixture',{...source,service,productionRequest:{version:1,vinylGrade:'premium'}},'2026-09-10T00:00:00Z');
  assert.equal(m.body.requestedService,label);assert.equal(m.body.message,source.message);
  assert.ok(m.unsupportedFields.some(x=>x.field==='productionRequest'));
 }
 for(const [key,label] of Object.entries(legacy)) assert.equal(adapter.SERVICE_MAPPING[key],label);
 assert.equal(Object.keys(adapter.SERVICE_MAPPING).length,40); // 31 historical keys + 9 aliases, other already existed.
 assert.equal(adapter.SERVICE_MAPPING['vehicle-wrap'],'Vehicle Wraps');
 assert.equal(adapter.SERVICE_MAPPING['wrap-production'],expected.wrap_production_only);
 assert.equal(adapter.SERVICE_MAPPING['print-partner'],expected.wholesale_printing);
});
test('version-1 explicit consent overrides legacy consent; false and missing never authorize SMS',()=>{
 for(const value of [true,false,undefined,'true']){
  const m=adapter.buildRequestMapping('local_consent_fixture',{...source,service:'vinyl_large_format_printing',productionRequest:{version:1,smsConsent:value},boatSurvey:{smsConsent:true}});
  assert.equal(m.body.smsConsent,value===true);assert.equal(m.body.marketingConsent,false);
 }
 const legacy=adapter.buildRequestMapping('local_legacy_fixture',{...source,service:'vehicle-wrap',boatSurvey:{smsConsent:true}});
 assert.equal(legacy.body.smsConsent,true);
});
