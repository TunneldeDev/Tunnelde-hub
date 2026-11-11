import assert from "node:assert/strict";
export function checkRuntimeResources(directory, catalogue) {
  const resources=directory.runtime?.resources;
  assert.ok(resources,"Missing runtime resource discovery");
  for (const action of ["snapshot","identify","release"]) {
    assert.equal(resources[action],"resources."+action);
    const method=catalogue.methods.find(({name})=>name===resources[action]);
    assert.ok(method,"Missing resource method");assert.equal(method.stability,"experimental");assert.deepEqual(method.permissions,[]);
  }
  assert.equal(resources.ownership,"current-runtime");assert.equal(resources.pageSize,128);assert.equal(resources.pageBytes,65536);assert.equal(resources.observationLimit,4096);
  assert.equal(resources.operationLimitPerPlugin,4);assert.equal(resources.operationLimitTotal,16);assert.equal(resources.observationTimeoutMs,5000);
  assert.deepEqual(resources.kinds,["connection","forward","mount","task","transfer"]);assert.deepEqual(resources.states,["owned","releaseRequested","cleanupRequired"]);
  assert.equal(resources.paging,"revision-bound");assert.equal(resources.cancellation,"cooperative-settlement");assert.equal(resources.persistence,false);
}
