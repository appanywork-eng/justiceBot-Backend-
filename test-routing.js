import("./server.mjs")
  .then(() => console.log("Backend module loaded without crash"))
  .catch(err => console.error("Crash:", err));
