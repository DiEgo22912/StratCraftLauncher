#!/usr/bin/env node
// DEPRECATED: automatic fetching removed.
console.error('fetch-missing-and-run has been deprecated and removed.');
console.error('Please use one of the following:');
console.error('  1) Run directly from your local .minecraft (recommended): \n     node run-client-test.js <versionId> <username> --mcdir "C:\\Users\\<you>\\AppData\\Roaming\\.minecraft"');
console.error('  2) Rebuild a standalone archive (includes full libraries): \n     node assemble-from-local.js "C:\\Users\\waser\\AppData\\Roaming\\.minecraft" "forge-1.20.1-47.4.16"\n     node run-client-test.js forge-1.20.1-47.4.16 <username>');
process.exit(1);
