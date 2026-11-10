import assert from "node:assert/strict";
export function checkConfigurationPoint(point,catalogue) {
  assert.equal(point.registration.manifest,"configuration");
  assert.equal(point.ownership,"manifest");
  assert.equal(point.stability,"experimental");
  assert.deepEqual(point.permissions,[]);assert.deepEqual(point.writePermissions,[]);
  assert.deepEqual(point.limits,{groups:16,fields:64,schemaBytes:65536,documentBytes:65536,backups:8,totalBytes:67108864});
  for (const key of ["read","replace"]) {
    const method=catalogue.methods.find(method => method.name === point.registration[key]);
    assert.ok(method,"Missing configuration registration method");
    assert.deepEqual(method.permissions,[]);assert.equal(method.stability,"experimental");
  }
  assert.equal(point.registration.read,"configuration.snapshot");assert.equal(point.registration.replace,"configuration.update");
}
