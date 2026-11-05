const fs = require("fs");
const path = require("path");

const FILE = path.join(
  __dirname,
  "../deployments/amoy/echo-v4-pending.json"
);

function loadPending() {
  if (!fs.existsSync(FILE)) return {};

  const data = JSON.parse(fs.readFileSync(FILE, "utf8"));

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid pending transaction journal");
  }

  return data;
}

function savePending(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });

  const temp = FILE + ".tmp";

  fs.writeFileSync(
    temp,
    JSON.stringify(data, null, 2) + "\n",
    { mode: 0o600 }
  );

  fs.renameSync(temp, FILE);
}

function recordTransaction(name, hash) {
  const pending = loadPending();

  if (pending[name] && pending[name] !== hash) {
    throw new Error(
      "Unresolved transaction already recorded for " + name
    );
  }

  pending[name] = hash;
  savePending(pending);
}

function clearTransaction(name) {
  const pending = loadPending();
  delete pending[name];
  savePending(pending);
}

module.exports = {
  savePending,
  loadPending,
  recordTransaction,
  clearTransaction
};
