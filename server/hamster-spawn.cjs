'use strict';
// Validated against the current world layout by scripts/hamster-online-spawn-check.ts.
// Appearance only: no petting, reward, movement or per-player state.
const POINT=Object.freeze({x:276.6520742336288,z:886.0425362661481});
function hamsterSpawn(){return {version:1,x:POINT.x,z:POINT.z};}
module.exports={hamsterSpawn};
