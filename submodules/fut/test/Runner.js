import { Test } from "./Test.js";

if (Test.run()) {
	console.log("PASSED");
	process.exit(0);
}
else {
	console.log("FAILED");
	process.exit(1);
}
